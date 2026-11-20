//! Synced lyrics for the music page. Windows' media session gives the playing track's title,
//! artist, album and duration but no lyrics, so they are looked up: first in a folder of .lrc
//! files the user keeps (local.rs), then, only when the user turned online lyrics on, on LRCLIB
//! (lrclib.rs) and, when the user also turned Chinese sources on, on Kugou (kugou.rs) and
//! NetEase (netease.rs), which are unofficial. Online answers, and "not found", are cached in
//! `lyrics-cache/` in the app data folder, so a track is asked for once. The text is returned as
//! LRC, with the translation as a second LRC when the source has one; the island parses both.

mod applemusic;
mod found;
mod krc;
mod kugou;
mod kugou_cache;
mod local;
mod lrclib;
mod matching;
mod netease;
mod qqmusic;
mod qrc_cipher;
mod soda_cache;
mod soda_lmdb;
mod soda_msgpack;
mod ttml;
mod word_formats;

use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use found::FoundLyrics;
use matching::{cache_key, named_in_simplified, stable_hash, traditional_chars};
use crate::win32::chinese::to_simplified;

const CACHE_DIR_NAME: &str = "lyrics-cache";
/// Told to the island when the Apple Music token is replaced or cleared: the answers it holds
/// were asked with the old token and have to be asked again.
const APPLE_MUSIC_TOKEN_CHANGED: &str = "apple-music-token-changed";
/// A track no source had lyrics for is asked about again after a week.
const MISSING_TTL: Duration = Duration::from_secs(7 * 24 * 60 * 60);
/// Past this many cached tracks, the oldest are removed.
const MAX_CACHED: usize = 2000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsQuery {
    title: String,
    #[serde(default)]
    artist: String,
    #[serde(default)]
    album: String,
    #[serde(default)]
    duration_ms: i64,
    /// The user's folder of .lrc files; empty when none is set.
    #[serde(default)]
    folder: String,
    /// Whether LRCLIB may be asked.
    #[serde(default)]
    online: bool,
    /// Whether Kugou and NetEase may be asked too (only with `online`).
    #[serde(default)]
    chinese: bool,
    /// The song id a player plugin gives, such as `NCM-487885426` (MediaState::track_id).
    #[serde(default)]
    track_id: Option<String>,
    /// SMTC AUMID/process name; absent in older frontends.
    #[serde(default)]
    source_app_id: Option<String>,
    #[serde(default)]
    word_fill: bool,
    /// Whether the user turned the official Apple Music lyrics on.
    #[serde(default)]
    apple_music: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Lyrics {
    /// "local", "lrclib", "kugou", "netease" or "applemusic".
    source: &'static str,
    /// Synced lyrics in LRC format.
    lrc: String,
    /// The translation of the same lines, in LRC, when the source has one.
    translation: Option<String>,
    /// The song's length as the source lists it, when known.
    duration_ms: Option<i64>,
}

/// One cached online answer: lyrics, or no `lrc` when no source had any. Entries written before
/// Chinese sources existed have neither `source` nor `translation` and came from LRCLIB.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CacheEntry {
    key: String,
    lrc: Option<String>,
    #[serde(default)]
    source: Option<String>,
    #[serde(default)]
    translation: Option<String>,
    /// Written by a version that keeps Kugou's word times; older Kugou entries are fetched again.
    #[serde(default)]
    word_times: bool,
    /// The source's length for the song, when it listed one.
    #[serde(default)]
    duration_ms: Option<i64>,
    /// Written by a version that keeps the length; older entries with lyrics are fetched again.
    #[serde(default)]
    durations: bool,
    fetched_at: u64,
    #[serde(default)]
    schema_version: u32,
}

/// An online answer: the source and its lyrics.
type Answer = (&'static str, FoundLyrics);

fn source_name(name: &str) -> &'static str {
    match name {
        "kugou" => "kugou",
        "netease" => "netease",
        "qqmusic" => "qqmusic",
        "soda" => "soda",
        "applemusic" => "applemusic",
        _ => "lrclib",
    }
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |time| time.as_secs())
}

fn cache_path(dir: &Path, key: &str) -> PathBuf {
    dir.join(format!("{:016x}.json", stable_hash(key)))
}

/// The cached answer for `key`: `Some(Some(..))`, `Some(None)` for a recent "not found", or
/// `None` when nothing usable is cached.
fn read_cache(dir: &Path, key: &str, now: u64) -> Option<Option<Answer>> {
    let entry: CacheEntry = serde_json::from_str(&fs::read_to_string(cache_path(dir, key)).ok()?).ok()?;
    if entry.key != key {
        return None;
    }
    match entry.lrc {
        Some(_) if entry.source.as_deref() == Some("kugou") && !entry.word_times => None,
        Some(_) if !entry.durations => None,
        Some(lrc) => {
            let source = source_name(entry.source.as_deref().unwrap_or_default());
            Some(Some((source, FoundLyrics { lrc, translation: entry.translation, duration_ms: entry.duration_ms })))
        }
        None if now.saturating_sub(entry.fetched_at) < MISSING_TTL.as_secs() => Some(None),
        None => None,
    }
}

fn write_cache(dir: &Path, key: &str, answer: Option<&Answer>, now: u64) {
    if fs::create_dir_all(dir).is_err() {
        return;
    }
    let entry = CacheEntry {
        key: key.to_string(),
        lrc: answer.map(|(_, found)| found.lrc.clone()),
        source: answer.map(|(source, _)| (*source).to_string()),
        translation: answer.and_then(|(_, found)| found.translation.clone()),
        word_times: true,
        duration_ms: answer.and_then(|(_, found)| found.duration_ms),
        durations: true,
        fetched_at: now,
        schema_version: 3,
    };
    if let Ok(text) = serde_json::to_string(&entry) {
        let _ = fs::write(cache_path(dir, key), text);
    }
    prune_cache(dir, MAX_CACHED);
}

/// Removes the oldest cache files until at most `keep` are left.
fn prune_cache(dir: &Path, keep: usize) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut files: Vec<(SystemTime, PathBuf)> = entries
        .flatten()
        .filter_map(|entry| Some((entry.metadata().ok()?.modified().ok()?, entry.path())))
        .collect();
    if files.len() <= keep {
        return;
    }
    files.sort();
    for (_, path) in &files[..files.len() - keep] {
        let _ = fs::remove_file(path);
    }
}

/// Lyrics as shown: a track named in simplified Chinese gets simplified lyrics and translation,
/// since many Chinese lyrics on LRCLIB were uploaded in traditional characters.
fn for_display(source: &'static str, found: FoundLyrics, title: &str, artist: &str) -> Lyrics {
    let simplify = |text: String| {
        if named_in_simplified(title, artist) && traditional_chars(&text) > 2 {
            to_simplified(&text).unwrap_or(text)
        } else {
            text
        }
    };
    Lyrics { source, lrc: simplify(found.lrc), translation: found.translation.map(simplify), duration_ms: found.duration_ms }
}

/// Whether the player is Apple Music, by the signs the media session gives.
fn is_apple_music(source_app_id: Option<&str>) -> bool {
    let player = source_app_id.unwrap_or_default().to_ascii_lowercase();
    ["applemusic", "apple.music", "music.ui"].iter().any(|sign| player.contains(sign))
}

/// The online sources to ask, in order. Apple's own lyrics come first when the player is
/// Apple Music and the user turned them on; the rest is by the song.
fn source_order(query: &LyricsQuery) -> Vec<&'static str> {
    let mut order = source_order_by_song(query);
    if query.apple_music && is_apple_music(query.source_app_id.as_deref()) {
        order.insert(0, "applemusic");
    }
    order
}

/// The online sources to ask, in order. A song named in Chinese asks Kugou and NetEase first,
/// as LRCLIB has few Chinese songs; a NetEase song the player named asks NetEase first.
fn source_order_by_song(query: &LyricsQuery) -> Vec<&'static str> {
    if !query.chinese {
        return vec!["lrclib"];
    }
    let player = query.source_app_id.as_deref().unwrap_or_default().to_ascii_lowercase();
    if qqmusic::track_id(query.track_id.as_deref()).is_some() || player.contains("qqmusic") {
        return vec!["qqmusic", "kugou", "netease", "lrclib"];
    }
    let chinese_named = format!("{}{}", query.title, query.artist).chars().any(|c| ('\u{4E00}'..='\u{9FFF}').contains(&c));
    match (netease::track_id(query.track_id.as_deref()).is_some(), chinese_named) {
        (true, _) => vec!["netease", "kugou", "qqmusic", "lrclib"],
        (false, true) => vec!["kugou", "netease", "qqmusic", "lrclib"],
        (false, false) => vec!["lrclib", "kugou", "netease", "qqmusic"],
    }
}

/// The cache key as it was before the recording and player were part of it.
fn cache_base_key(query: &LyricsQuery) -> String {
    let mut key = cache_key(&query.title, &query.artist, query.duration_ms);
    if query.chinese {
        key.push_str("\u{1f}cn");
    }
    key
}

/// The cache key of this request: the old key plus the recording and the player it came from.
fn cache_scoped_key(query: &LyricsQuery, has_token: bool) -> String {
    let mut key = cache_base_key(query);
    key.push_str(&format!("\u{1f}{}\u{1f}{}\u{1f}{}", query.title, query.source_app_id.as_deref().unwrap_or_default(), query.track_id.as_deref().unwrap_or_default()));
    if query.word_fill { key.push_str("\u{1f}words"); }
    // Apple's own lyrics get their own key, or a cached lyric from another source would
    // keep being served and the setting would look like it had no effect. The lead is part
    // of the key: lyrics cached before it changed keep the old times. So is the token: without
    // one Apple is not asked, and the "no lyrics" answer written then must not hide the real
    // one for the week a miss is kept.
    if query.apple_music && is_apple_music(query.source_app_id.as_deref()) {
        key.push_str(&format!("\u{1f}apple\u{1f}lead{}", ttml::LEAD_MS));
        if !has_token {
            key.push_str("\u{1f}notoken");
        }
    }
    key
}

/// Whether Apple's own lyrics may be shown now: the setting is on, the player is Apple Music,
/// and a token is stored. Answers cached before the Apple key had a segment of its own live
/// under the plain key, so without this check a turned-off setting, or a removed token, still
/// served Apple's lyrics.
fn serves_apple_lyrics(query: &LyricsQuery, has_token: bool) -> bool {
    query.apple_music && is_apple_music(query.source_app_id.as_deref()) && has_token
}

/// A cached answer, unless it is Apple's lyrics and they may not be used now: then it is a miss.
fn cache_answer(cached: Option<Option<Answer>>, apple_allowed: bool) -> Option<Option<Answer>> {
    match cached {
        Some(Some((source, _))) if source == "applemusic" && !apple_allowed => None,
        other => other,
    }
}

/// The first source that has lyrics. `Err` only when every source asked failed to answer.
async fn fetch_online(query: &LyricsQuery) -> Result<Option<Answer>, String> {
    let (title, artist) = (query.title.as_str(), query.artist.as_str());
    let mut errors = Vec::new();
    let mut answered = false;
    let mut fallback = None;
    for source in source_order(query) {
        let result = match source {
            "kugou" => kugou::fetch(title, artist, query.duration_ms).await,
            "netease" => netease::fetch(title, artist, query.duration_ms, query.track_id.as_deref()).await,
            "qqmusic" => qqmusic::fetch(title, artist, query.duration_ms, query.track_id.as_deref()).await,
            // Without a token the source is simply not turned on.
            "applemusic" => match applemusic::read_token() {
                Some(token) => applemusic::fetch(title, artist, query.album.as_str(), query.duration_ms, &token).await,
                None => Ok(None),
            },
            _ => lrclib::fetch(title, artist, &query.album, query.duration_ms).await,
        };
        match result {
            Ok(Some(found)) => {
                if !query.word_fill || found.lrc.contains('<') { return Ok(Some((source, found))); }
                if fallback.is_none() { fallback = Some((source, found)); }
            },
            Ok(None) => answered = true,
            Err(error) => errors.push(error),
        }
    }
    if fallback.is_some() { Ok(fallback) } else if answered {
        Ok(None)
    } else {
        Err(errors.join("; "))
    }
}

/// Synced lyrics for the playing track, or null when none were found. Errors only when no
/// source could be reached; that answer is not cached, so the next track change asks again.
#[tauri::command]
pub async fn get_lyrics(app: AppHandle, query: LyricsQuery) -> Result<Option<Lyrics>, String> {
    if query.title.trim().is_empty() {
        return Ok(None);
    }
    let folder = query.folder.trim().to_string();
    if !folder.is_empty() {
        let (title, artist) = (query.title.clone(), query.artist.clone());
        let found = tauri::async_runtime::spawn_blocking(move || local::find(Path::new(&folder), &title, &artist))
            .await
            .map_err(|error| format!("Failed to join the lyrics folder search: {error}"))?;
        if let Some(lrc) = found {
            return Ok(Some(for_display("local", FoundLyrics { lrc, translation: None, duration_ms: None }, &query.title, &query.artist)));
        }
    }
    // Native client caches precede online caches, so a newly downloaded word-timed lyric wins.
    if query.chinese {
        let (title, artist, duration) = (query.title.clone(), query.artist.clone(), query.duration_ms);
        let player = query.source_app_id.as_deref().unwrap_or_default().to_ascii_lowercase();
        let native = tauri::async_runtime::spawn_blocking(move || {
            if player.contains("kugou") { kugou_cache::read(&title, &artist, duration).map(|found| ("kugou", found)) }
            else if player.contains("sodamusic") || player.contains("汽水") { soda_cache::read(&title, &artist, duration).map(|found| ("soda", found)) }
            else { None }
        }).await.map_err(|error| format!("Failed to join native lyrics lookup: {error}"))?;
        if let Some((source, found)) = native { return Ok(Some(for_display(source, found, &query.title, &query.artist))); }
    }
    if !query.online {
        return Ok(None);
    }
    let cache_dir = app.path().app_data_dir().map_err(|error| error.to_string())?.join(CACHE_DIR_NAME);
    // A miss with LRCLIB alone says nothing about the Chinese sources.
    let legacy_key = cache_base_key(&query);
    let has_token = applemusic::read_token().is_some();
    let key = cache_scoped_key(&query, has_token);
    let now = now_secs();
    let apple_allowed = serves_apple_lyrics(&query, has_token);
    let cached = cache_answer(read_cache(&cache_dir, &key, now), apple_allowed)
        .or_else(|| cache_answer(read_cache(&cache_dir, &legacy_key, now), apple_allowed));
    let fresh = fs::read_to_string(cache_path(&cache_dir, &key)).ok()
        .and_then(|text| serde_json::from_str::<CacheEntry>(&text).ok())
        .is_some_and(|entry| entry.key == key && entry.schema_version >= 3
            && (entry.lrc.as_ref().is_some_and(|text| text.contains('<')) || now.saturating_sub(entry.fetched_at) < MISSING_TTL.as_secs()));
    let answer = if fresh && cached.is_some() { cached.flatten() } else {
        match fetch_online(&query).await {
            Ok(Some(fetched)) => { write_cache(&cache_dir, &key, Some(&fetched), now); Some(fetched) },
            Ok(None) => {
                let fallback = cached.flatten();
                if fallback.is_none() { write_cache(&cache_dir, &key, None, now); }
                fallback
            },
            Err(error) => match cached.flatten() { Some(fallback) => Some(fallback), None => return Err(error) },
        }
    };
    Ok(answer.map(|(source, found)| for_display(source, found, &query.title, &query.artist)))
}

/// Keeps the user's Apple Music media token, so the official lyrics can be asked for.
#[tauri::command]
pub async fn set_apple_music_token(app: AppHandle, token: String) -> Result<(), String> {
    applemusic::write_token(&token)?;
    let _ = app.emit_to(crate::island::WINDOW_LABEL, APPLE_MUSIC_TOKEN_CHANGED, ());
    Ok(())
}

/// Forgets the user's Apple Music media token.
#[tauri::command]
pub async fn clear_apple_music_token(app: AppHandle) -> Result<(), String> {
    applemusic::clear_token()?;
    let _ = app.emit_to(crate::island::WINDOW_LABEL, APPLE_MUSIC_TOKEN_CHANGED, ());
    Ok(())
}

/// Whether an Apple Music media token is stored.
#[tauri::command]
pub async fn has_apple_music_token() -> bool {
    applemusic::read_token().is_some()
}

/// This module's Tauri commands, chained into `lib.rs`'s `generate_handler!`.
macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::lyrics::get_lyrics,
            crate::lyrics::set_apple_music_token,
            crate::lyrics::clear_apple_music_token,
            crate::lyrics::has_apple_music_token,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;

#[cfg(test)]
mod tests;
