//! Synced lyrics for the music page. Windows' media session gives the playing track's title,
//! artist, album and duration but no lyrics, so they are looked up: first in a folder of .lrc
//! files the user keeps (local.rs), then, only when the user turned it on, on LRCLIB
//! (lrclib.rs). Online answers, and "not found", are cached in `lyrics-cache/` in the app data
//! folder, so a track is asked for once. The text is returned as LRC; the island parses it.

mod local;
mod lrclib;
mod matching;

use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use matching::{cache_key, stable_hash};

const CACHE_DIR_NAME: &str = "lyrics-cache";
/// A track LRCLIB had no lyrics for is asked about again after a week.
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
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Lyrics {
    /// "local" or "lrclib".
    source: &'static str,
    /// Synced lyrics in LRC format.
    lrc: String,
}

/// One cached answer from LRCLIB: lyrics, or `None` when it had none.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CacheEntry {
    key: String,
    lrc: Option<String>,
    fetched_at: u64,
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |time| time.as_secs())
}

fn cache_path(dir: &Path, key: &str) -> PathBuf {
    dir.join(format!("{:016x}.json", stable_hash(key)))
}

/// The cached answer for `key`: `Some(Some(lrc))`, `Some(None)` for a recent "not found", or
/// `None` when nothing usable is cached.
fn read_cache(dir: &Path, key: &str, now: u64) -> Option<Option<String>> {
    let entry: CacheEntry = serde_json::from_str(&fs::read_to_string(cache_path(dir, key)).ok()?).ok()?;
    if entry.key != key {
        return None;
    }
    match entry.lrc {
        Some(lrc) => Some(Some(lrc)),
        None if now.saturating_sub(entry.fetched_at) < MISSING_TTL.as_secs() => Some(None),
        None => None,
    }
}

fn write_cache(dir: &Path, key: &str, lrc: Option<&str>, now: u64) {
    if fs::create_dir_all(dir).is_err() {
        return;
    }
    let entry = CacheEntry { key: key.to_string(), lrc: lrc.map(str::to_string), fetched_at: now };
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

/// Synced lyrics for the playing track, or null when none were found. Errors only when LRCLIB
/// could not be reached; that answer is not cached, so the next track change asks again.
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
            return Ok(Some(Lyrics { source: "local", lrc }));
        }
    }
    if !query.online {
        return Ok(None);
    }
    let cache_dir = app.path().app_data_dir().map_err(|error| error.to_string())?.join(CACHE_DIR_NAME);
    let key = cache_key(&query.title, &query.artist, query.duration_ms);
    if let Some(cached) = read_cache(&cache_dir, &key, now_secs()) {
        return Ok(cached.map(|lrc| Lyrics { source: "lrclib", lrc }));
    }
    let fetched = lrclib::fetch(&query.title, &query.artist, &query.album, query.duration_ms).await?;
    write_cache(&cache_dir, &key, fetched.as_deref(), now_secs());
    Ok(fetched.map(|lrc| Lyrics { source: "lrclib", lrc }))
}

/// This module's Tauri commands, chained into `lib.rs`'s `generate_handler!`.
macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::lyrics::get_lyrics,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_cache_keeps_lyrics_and_recent_misses() {
        let dir = std::env::temp_dir().join(format!("focusd-lyrics-cache-{}", std::process::id()));
        let now = 1_800_000_000;
        assert_eq!(read_cache(&dir, "a", now), None);
        write_cache(&dir, "a", Some("[00:01.00]x"), now);
        write_cache(&dir, "b", None, now);
        assert_eq!(read_cache(&dir, "a", now + 999_999_999), Some(Some("[00:01.00]x".into())));
        assert_eq!(read_cache(&dir, "b", now + 60), Some(None));
        // A miss is asked about again after a week.
        assert_eq!(read_cache(&dir, "b", now + MISSING_TTL.as_secs()), None);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn pruning_keeps_the_newest_files() {
        let dir = std::env::temp_dir().join(format!("focusd-lyrics-prune-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        for name in ["1", "2", "3"] {
            fs::write(dir.join(name), name).unwrap();
            std::thread::sleep(Duration::from_millis(20));
        }
        prune_cache(&dir, 2);
        let mut left: Vec<String> = fs::read_dir(&dir).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into()).collect();
        left.sort();
        assert_eq!(left, ["2", "3"]);
        fs::remove_dir_all(&dir).unwrap();
    }
}
