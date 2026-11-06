//! Synced lyrics from LRCLIB (https://lrclib.net), a free, open lyrics database with no key.
//! Its rules (https://lrclib.net/docs.md): send a User-Agent naming the app; `/api/get` matches
//! a track by name, artist, album and duration (within 2 s); `/api/search` finds candidates.
//! Only used when the user turned online lyrics on.

use std::time::Duration;

use serde::Deserialize;

use super::matching::{clean_title, close_duration, same_artist};
use crate::system::updater::get_updater_proxy;

const BASE: &str = "https://lrclib.net/api";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
const USER_AGENT: &str = concat!("FocuSD-Island/", env!("CARGO_PKG_VERSION"), " (https://github.com/TixXin/fly-island)");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Record {
    #[serde(default)]
    track_name: String,
    #[serde(default)]
    artist_name: String,
    /// Seconds.
    #[serde(default)]
    duration: f64,
    synced_lyrics: Option<String>,
}

/// The synced lyrics of the search result that is the playing track: same cleaned title, a
/// shared artist and a close duration; the closest duration wins. `None` when none is.
pub(super) fn best_match(records: &[Record], title: &str, artist: &str, duration_ms: i64) -> Option<String> {
    let title = clean_title(title);
    records
        .iter()
        .filter(|record| record.synced_lyrics.as_deref().is_some_and(|lyrics| !lyrics.trim().is_empty()))
        .filter(|record| clean_title(&record.track_name) == title && same_artist(&record.artist_name, artist))
        .filter(|record| close_duration(duration_ms, (record.duration * 1000.0) as i64))
        .min_by_key(|record| (duration_ms - (record.duration * 1000.0) as i64).abs())
        .and_then(|record| record.synced_lyrics.clone())
}

fn client() -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder().timeout(REQUEST_TIMEOUT).user_agent(USER_AGENT);
    // Same proxy as the updater: env vars first, then the Windows system proxy.
    if let Some(proxy) = get_updater_proxy() {
        let proxy = reqwest::Proxy::all(&proxy).map_err(|error| format!("Invalid proxy {proxy}: {error}"))?;
        builder = builder.proxy(proxy);
    }
    builder.build().map_err(|error| format!("Could not create the HTTP client: {error}"))
}

/// One JSON answer; `None` for 404, which LRCLIB gives when it has no such track.
async fn get_json<T: for<'de> Deserialize<'de>>(client: &reqwest::Client, path: &str, query: &[(&str, String)]) -> Result<Option<T>, String> {
    let url = reqwest::Url::parse_with_params(&format!("{BASE}/{path}"), query).map_err(|error| error.to_string())?;
    let response = client.get(url).send().await.map_err(|error| format!("Could not reach LRCLIB: {error}"))?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(format!("LRCLIB answered {}", response.status()));
    }
    response.json().await.map(Some).map_err(|error| format!("LRCLIB sent something unexpected: {error}"))
}

/// Synced lyrics for the track: an exact lookup when the duration is known, then a search.
/// `Ok(None)` when LRCLIB has none; `Err` when it could not be asked.
pub(super) async fn fetch(title: &str, artist: &str, album: &str, duration_ms: i64) -> Result<Option<String>, String> {
    let client = client()?;
    if duration_ms > 0 && !artist.is_empty() {
        let query = [
            ("track_name", title.to_string()),
            ("artist_name", artist.to_string()),
            ("album_name", album.to_string()),
            ("duration", ((duration_ms + 500) / 1000).to_string()),
        ];
        let record: Option<Record> = get_json(&client, "get", &query).await?;
        if let Some(lyrics) = record.and_then(|record| record.synced_lyrics).filter(|lyrics| !lyrics.trim().is_empty()) {
            return Ok(Some(lyrics));
        }
    }
    let mut query = vec![("track_name", clean_title(title))];
    if !artist.is_empty() {
        query.push(("artist_name", artist.to_string()));
    }
    let records: Vec<Record> = get_json(&client, "search", &query).await?.unwrap_or_default();
    Ok(best_match(&records, title, artist, duration_ms))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(track: &str, artist: &str, seconds: f64, lyrics: Option<&str>) -> Record {
        Record { track_name: track.into(), artist_name: artist.into(), duration: seconds, synced_lyrics: lyrics.map(Into::into) }
    }

    #[test]
    fn search_results_must_be_the_same_track() {
        let records = [
            record("晴天", "别人", 269.0, Some("[00:01.00]cover")),
            record("晴天 (Live)", "周杰伦", 300.0, Some("[00:01.00]live")),
            record("晴天", "周杰伦", 271.0, Some("[00:01.00]near")),
            record("晴天", "周杰伦", 269.5, Some("[00:01.00]closest")),
            record("晴天", "周杰伦", 269.0, None),
        ];
        assert_eq!(best_match(&records, "晴天", "周杰伦", 269_000).as_deref(), Some("[00:01.00]closest"));
        assert_eq!(best_match(&records, "七里香", "周杰伦", 269_000), None);
        assert_eq!(best_match(&records, "晴天", "周杰伦", 200_000), None);
    }

    #[test]
    fn answers_parse_with_missing_fields() {
        let parsed: Vec<Record> = serde_json::from_str(r#"[{"trackName":"A","syncedLyrics":null},{"id":1}]"#).unwrap();
        assert_eq!(parsed.len(), 2);
        assert!(parsed[0].synced_lyrics.is_none());
    }
}
