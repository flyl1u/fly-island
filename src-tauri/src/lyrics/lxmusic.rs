//! Lyrics from the LX Music desktop player's own local open-api (落雪音乐). When that player is
//! the media source, the service on 127.0.0.1 serves the exact synced lyrics it displays, with
//! the translation it loaded — a surer answer than any search, and nothing leaves this computer.
//! /status names the playing track (so a stale query cannot pick up the wrong song), /lyric-all
//! gives the LRC with its translation, and /lyric is the plain-text fallback.

use std::time::Duration;

use serde_json::Value;

use super::found::{from_lines, lrc_lines, FoundLyrics};
use super::matching::{clean_title, fold, same_artist};
use super::scoring::Playing;

/// The port LX Music listens on unless the user changed it in its Open API settings.
pub(super) const DEFAULT_PORT: u16 = 23330;

/// Whether the media session belongs to LX Music (its AUMID is like `lx-music-desktop.exe`).
pub(super) fn is_player(source_app_id: Option<&str>) -> bool {
    let id = source_app_id.unwrap_or_default().to_ascii_lowercase();
    id.contains("lx-music") || id.contains("lxmusic") || id.contains("lx_music")
}

/// A loopback client: short timeout, and never the updater's proxy — the player is on this
/// computer, and a proxy would intercept or refuse the local address.
fn local_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .no_proxy()
        .build()
        .map_err(|error| format!("Could not create the LX Music client: {error}"))
}

/// Whether /status describes the track that plays: the cleaned titles equal and an artist shared.
pub(super) fn status_matches(status: &Value, playing: &Playing<'_>) -> bool {
    let name = status["name"].as_str().unwrap_or_default();
    if name.trim().is_empty() {
        return false;
    }
    let singer = status["singer"].as_str().unwrap_or_default();
    fold(&clean_title(name)) == fold(&clean_title(playing.title)) && same_artist(singer, playing.artist)
}

/// The LRC and its translation, aligned by time the way the NetEase source aligns its own.
pub(super) fn lyrics_of(answer: &Value, title: &str) -> Option<FoundLyrics> {
    let lrc = answer["lyric"].as_str().filter(|text| !text.trim().is_empty())?;
    let lines = lrc_lines(lrc);
    let translated = lrc_lines(answer["tlyric"].as_str().unwrap_or_default());
    let translations: Vec<String> = lines
        .iter()
        .map(|(ms, _)| translated.iter().find(|(at, _)| at.abs_diff(*ms) < 50).map(|(_, text)| text.clone()).unwrap_or_default())
        .collect();
    let has_translation = translations.iter().any(|line| !line.is_empty());
    from_lines(&lines, has_translation.then_some(translations.as_slice()), title)
}

/// The player's own lyrics for the playing track, scored as a sure answer. `Ok(None)` when the
/// player is on another song or has no lyrics; `Err` only when its service cannot be reached.
pub(super) async fn fetch(playing: &Playing<'_>, port: u16) -> Result<Option<(FoundLyrics, u32)>, String> {
    let client = local_client()?;
    let base = format!("http://127.0.0.1:{port}");
    let status: Value = client
        .get(format!("{base}/status"))
        .send()
        .await
        .map_err(|error| format!("Could not reach LX Music: {error}"))?
        .json()
        .await
        .map_err(|error| format!("LX Music sent something unexpected: {error}"))?;
    if !status_matches(&status, playing) {
        return Ok(None);
    }
    let duration_ms = (status["duration"].as_f64().unwrap_or(0.0) * 1000.0).round() as i64;
    let mut found = match client.get(format!("{base}/lyric-all")).send().await {
        Ok(response) if response.status().is_success() => {
            response.json::<Value>().await.ok().and_then(|answer| lyrics_of(&answer, playing.title))
        }
        _ => None,
    };
    if found.is_none() {
        if let Ok(response) = client.get(format!("{base}/lyric")).send().await {
            if response.status().is_success() {
                if let Ok(text) = response.text().await {
                    found = lyrics_of(&serde_json::json!({ "lyric": text }), playing.title);
                }
            }
        }
    }
    Ok(found.map(|lyrics| (lyrics.with_duration(duration_ms), 100)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn playing<'a>(title: &'a str, artist: &'a str) -> Playing<'a> {
        Playing { title, artist, album: "", duration_ms: 0 }
    }

    #[test]
    fn the_player_is_recognized_by_its_aumid() {
        assert!(is_player(Some("lx-music-desktop.exe")));
        assert!(is_player(Some("LXMusic")));
        assert!(is_player(Some("lx_music")));
        assert!(!is_player(Some("MSEdge")));
        assert!(!is_player(None));
    }

    #[test]
    fn status_must_name_the_playing_track() {
        let status = json!({ "name": "drowsiness", "singer": "ヲタみん", "duration": 258.3 });
        assert!(status_matches(&status, &playing("drowsiness", "ヲタみん")));
        assert!(status_matches(&status, &playing("drowsiness", "")));
        assert!(!status_matches(&status, &playing("another song", "ヲタみん")));
        assert!(!status_matches(&status, &playing("drowsiness", "someone else")));
        assert!(!status_matches(&json!({ "name": "" }), &playing("drowsiness", "")));
        // Version notes do not make it another song.
        assert!(status_matches(&json!({ "name": "晴天 (Live)", "singer": "周杰伦" }), &playing("晴天", "周杰伦")));
    }

    #[test]
    fn lyrics_come_with_the_translation_matched_by_time() {
        let answer = json!({
            "lyric": "[00:00.000]作词: Bank of Innovation, Inc.\n[00:14.458]透明なTurret\n[00:17.037]絡まった　蒙昧のHeart\n",
            "tlyric": "[00:14.460]透明的炮塔\n",
        });
        let found = lyrics_of(&answer, "drowsiness").unwrap();
        assert_eq!(found.lrc, "[00:14.45]透明なTurret\n[00:17.03]絡まった　蒙昧のHeart\n");
        assert_eq!(found.translation.as_deref(), Some("[00:14.45]透明的炮塔\n"));
        assert!(lyrics_of(&json!({ "lyric": "" }), "x").is_none());
        assert!(lyrics_of(&json!({ "lyric": "[00:00.00]作词: x\n" }), "x").is_none());
    }
}
