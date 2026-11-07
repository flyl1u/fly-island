//! Lyrics from Kugou (酷狗), an unofficial source used only when the user turns Chinese sources
//! on. Three plain requests, no key or login (the same ones Lyricify-Lyrics-Helper, Apache-2.0,
//! sends: Providers/Web/Kugou/Api.cs): search songs for the track's hash, find lyrics for that
//! hash, then download them as KRC (krc.rs).

use serde_json::Value;

use super::found::{browser_client, from_lines, FoundLyrics};
use super::krc;
use super::matching::same_track;

const SONG_SEARCH: &str = "http://mobilecdn.kugou.com/api/v3/search/song";
const LYRICS_SEARCH: &str = "https://lyrics.kugou.com/search";
const LYRICS_DOWNLOAD: &str = "https://lyrics.kugou.com/download";

/// The hash of the search result that is the playing track, and its length in ms; the closest
/// length wins, or the first result when the playing length is not known.
pub(super) fn best_song(search: &Value, title: &str, artist: &str, duration_ms: i64) -> Option<(String, i64)> {
    search["data"]["info"]
        .as_array()?
        .iter()
        .filter_map(|song| {
            let length = song["duration"].as_i64().unwrap_or(0) * 1000;
            let found = (song["songname"].as_str()?, song["singername"].as_str().unwrap_or_default(), length);
            let hash = song["hash"].as_str()?.to_string();
            same_track((title, artist, duration_ms), found).then_some((hash, length))
        })
        .enumerate()
        .min_by_key(|(index, (_, length))| if duration_ms > 0 { (duration_ms - length).abs() } else { *index as i64 })
        .map(|(_, song)| song)
}

async fn get_json(client: &reqwest::Client, url: &str, query: &[(&str, String)]) -> Result<Value, String> {
    let url = reqwest::Url::parse_with_params(url, query).map_err(|error| error.to_string())?;
    let response = client.get(url).send().await.map_err(|error| format!("Could not reach Kugou: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("Kugou answered {}", response.status()));
    }
    response.json().await.map_err(|error| format!("Kugou sent something unexpected: {error}"))
}

/// Synced lyrics, with a translation when Kugou has one. `Ok(None)` when it has none for the track.
pub(super) async fn fetch(title: &str, artist: &str, duration_ms: i64) -> Result<Option<FoundLyrics>, String> {
    let client = browser_client()?;
    let keyword = format!("{title} {artist}").trim().to_string();
    let search = get_json(&client, SONG_SEARCH, &[("format", "json".into()), ("keyword", keyword), ("page", "1".into()), ("pagesize", "20".into())]).await?;
    let Some((hash, length)) = best_song(&search, title, artist, duration_ms) else {
        return Ok(None);
    };
    let candidates = get_json(&client, LYRICS_SEARCH, &[
        ("ver", "1".into()),
        ("man", "yes".into()),
        ("client", "pc".into()),
        ("hash", hash),
        ("duration", length.to_string()),
    ])
    .await?;
    let Some(candidate) = candidates["candidates"].as_array().and_then(|all| all.first()) else {
        return Ok(None);
    };
    let (Some(id), Some(key)) = (candidate["id"].as_str(), candidate["accesskey"].as_str()) else {
        return Ok(None);
    };
    let download = get_json(&client, LYRICS_DOWNLOAD, &[
        ("ver", "1".into()),
        ("client", "pc".into()),
        ("id", id.to_string()),
        ("accesskey", key.to_string()),
        ("fmt", "krc".into()),
        ("charset", "utf8".into()),
    ])
    .await?;
    let Some(text) = download["content"].as_str().and_then(krc::decrypt) else {
        return Ok(None);
    };
    let lines: Vec<(u64, String)> = krc::lines(&text).iter().map(|line| (line.start_ms, line.timed_text())).collect();
    Ok(from_lines(&lines, krc::translations(&text).as_deref(), title))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn the_search_result_must_be_the_playing_song() {
        let search = json!({ "data": { "info": [
            { "hash": "dj", "songname": "余香 (DJ唐小力版)", "singername": "张小九", "duration": 259 },
            { "hash": "cover", "songname": "余香 (女声版)", "singername": "小匆匆", "duration": 244 },
            { "hash": "near", "songname": "餘香", "singername": "張小九", "duration": 248 },
            { "hash": "right", "songname": "余香", "singername": "张小九", "duration": 246 },
        ] } });
        assert_eq!(best_song(&search, "余香", "张小九", 246_019), Some(("right".to_string(), 246_000)));
        // NetEase reports no length: the first matching result, written in either script, is taken.
        assert_eq!(best_song(&search, "余香", "张小九", 0), Some(("near".to_string(), 248_000)));
        assert_eq!(best_song(&search, "七里香", "张小九", 0), None);
        assert_eq!(best_song(&json!({}), "余香", "张小九", 0), None);
    }
}
