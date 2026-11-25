//! Synced lyrics from LRCLIB (https://lrclib.net), a free, open lyrics database with no key.
//! Its rules (https://lrclib.net/docs.md): send a User-Agent naming the app; `/api/get` matches
//! a track by name, artist, album and duration (within 2 s); `/api/search` finds candidates.
//! Only used when the user turned online lyrics on.

use std::time::Duration;

use serde::Deserialize;

use super::found::FoundLyrics;
use super::matching::{named_in_simplified, traditional_chars};
use super::scoring::{ranked, search_keywords, Candidate, Playing};
use crate::system::updater::get_updater_proxy;

const BASE: &str = "https://lrclib.net/api";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
/// Scores this close to the best count as equally good when choosing between scripts.
const CLOSE_SCORES: u32 = 5;
/// A result scoring this much ends the search without the remaining search words.
const SURE: u32 = 90;
const MAX_KEYWORDS: usize = 3;
const USER_AGENT: &str = concat!("Fly-Island/", env!("CARGO_PKG_VERSION"), " (https://github.com/flyl1u/fly-island)");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Record {
    #[serde(default)]
    track_name: String,
    #[serde(default)]
    artist_name: String,
    #[serde(default)]
    album_name: String,
    /// Seconds.
    #[serde(default)]
    duration: f64,
    synced_lyrics: Option<String>,
}

/// The synced lyrics and length of the search result that is the playing track, scored by
/// title, singers and length. A track named in simplified Chinese takes a simplified copy over a
/// traditional one when the scores are close. `None` when no result scores enough.
pub(super) fn best_match(records: &[Record], playing: &Playing) -> Option<(u32, String, i64)> {
    let candidates: Vec<Candidate<usize>> = records
        .iter()
        .enumerate()
        .filter(|(_, record)| record.synced_lyrics.as_deref().is_some_and(|lyrics| !lyrics.trim().is_empty()))
        .map(|(index, record)| Candidate {
            id: index,
            name: record.track_name.clone(),
            singer: record.artist_name.clone(),
            album: record.album_name.clone(),
            duration_ms: (record.duration * 1000.0) as i64,
        })
        .collect();
    let ranked = ranked(playing, &candidates);
    let (top, _) = *ranked.first()?;
    let simplified = named_in_simplified(playing.title, playing.artist);
    let lyrics_of = |index: usize| records[index].synced_lyrics.clone().unwrap_or_default();
    let (score, index) = ranked
        .iter()
        .copied()
        .find(|&(score, index)| score + CLOSE_SCORES >= top && !(simplified && is_traditional(&lyrics_of(index))))
        .unwrap_or(ranked[0]);
    Some((score, lyrics_of(index), (records[index].duration * 1000.0) as i64))
}

/// Lyrics with more than a couple of traditional characters are taken as written in traditional.
fn is_traditional(lyrics: &str) -> bool {
    traditional_chars(lyrics) > 2
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

/// Synced lyrics and the match score: an exact lookup when the duration is known (LRCLIB matches
/// it within 2 s, score 100), then a search by each search word. `Ok(None)` when LRCLIB has none;
/// `Err` when it could not be asked.
pub(super) async fn fetch(playing: &Playing<'_>) -> Result<Option<(FoundLyrics, u32)>, String> {
    let client = client()?;
    let (title, artist, duration_ms) = (playing.title, playing.artist, playing.duration_ms);
    let mut exact = None;
    if duration_ms > 0 && !artist.is_empty() {
        let query = [
            ("track_name", title.to_string()),
            ("artist_name", artist.to_string()),
            ("album_name", playing.album.to_string()),
            ("duration", ((duration_ms + 500) / 1000).to_string()),
        ];
        let record: Option<Record> = get_json(&client, "get", &query).await?;
        exact = record.and_then(|record| record.synced_lyrics).filter(|lyrics| !lyrics.trim().is_empty());
        // Traditional lyrics for a track named in simplified: a search may find a simplified copy.
        if exact.as_deref().is_some_and(|lyrics| !named_in_simplified(title, artist) || !is_traditional(lyrics)) {
            return Ok(exact.map(|lrc| (plain(lrc, duration_ms), 100)));
        }
    }
    let mut records: Vec<Record> = Vec::new();
    let (mut answered, mut last_error) = (false, None);
    for keyword in search_keywords(title, artist, MAX_KEYWORDS) {
        match get_json::<Vec<Record>>(&client, "search", &[("q", keyword)]).await {
            Ok(found) => {
                answered = true;
                records.extend(found.unwrap_or_default());
            }
            Err(error) => last_error = Some(error),
        }
        if best_match(&records, playing).is_some_and(|(score, ..)| score >= SURE) {
            break;
        }
    }
    if let (false, Some(error)) = (answered, last_error) {
        return Err(error);
    }
    let found = best_match(&records, playing);
    Ok(match (found, exact) {
        (Some((_, found, _)), Some(exact)) if is_traditional(&found) => Some((plain(exact, duration_ms), 100)),
        (Some((score, found, length)), _) => Some((plain(found, length), score)),
        (None, exact) => exact.map(|lrc| (plain(lrc, duration_ms), 100)),
    })
}

/// LRCLIB's lyrics, which never come with a translation.
fn plain(lrc: String, duration_ms: i64) -> FoundLyrics {
    FoundLyrics { lrc, translation: None, duration_ms: None }.with_duration(duration_ms)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(track: &str, artist: &str, seconds: f64, lyrics: Option<&str>) -> Record {
        Record { track_name: track.into(), artist_name: artist.into(), album_name: String::new(), duration: seconds, synced_lyrics: lyrics.map(Into::into) }
    }

    fn pick(records: &[Record], title: &str, artist: &str, duration_ms: i64) -> Option<(String, i64)> {
        let playing = Playing { title, artist, album: "", duration_ms };
        best_match(records, &playing).map(|(_, lyrics, length)| (lyrics, length))
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
        assert_eq!(pick(&records, "晴天", "周杰伦", 269_000), Some(("[00:01.00]closest".to_string(), 269_500)));
        assert_eq!(pick(&records, "七里香", "周杰伦", 269_000), None);
        assert_eq!(pick(&records, "晴天", "周杰伦", 200_000), None);
    }

    #[test]
    fn a_track_named_in_simplified_prefers_simplified_lyrics() {
        let records = [
            record("余香", "张小九", 230.0, Some("[00:31.50]劃一根火柴 將慵倦的夜點亮 吐出一縷煙 飄向")),
            record("余香", "张小九", 232.0, Some("[00:31.50]划一根火柴 将慵倦的夜点亮 吐出一缕烟 飘向")),
        ];
        assert!(pick(&records, "余香", "张小九", 0).is_some_and(|(lyrics, _)| lyrics.contains("划一根")));
        assert!(pick(&records, "余香", "张小九", 230_000).is_some_and(|(lyrics, _)| lyrics.contains("划一根")));
        // Only traditional lyrics exist: they are still used.
        assert!(pick(&records[..1], "余香", "张小九", 0).is_some_and(|(lyrics, _)| lyrics.contains("劃")));
    }

    #[test]
    fn a_remaster_or_featured_singer_is_still_the_same_recording() {
        let records = [record("Yesterday - Remastered 2009", "The Beatles", 125.0, Some("[00:01.00]hit"))];
        assert!(pick(&records, "Yesterday", "The Beatles", 125_000).is_some());
        let records = [record("Get Lucky", "Daft Punk, Pharrell Williams", 369.0, Some("[00:01.00]hit"))];
        assert!(pick(&records, "Get Lucky (feat. Pharrell Williams)", "Daft Punk", 369_000).is_some());
    }

    #[test]
    fn answers_parse_with_missing_fields() {
        let parsed: Vec<Record> = serde_json::from_str(r#"[{"trackName":"A","syncedLyrics":null},{"id":1}]"#).unwrap();
        assert_eq!(parsed.len(), 2);
        assert!(parsed[0].synced_lyrics.is_none());
    }
}
