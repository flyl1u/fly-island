//! Lyrics from Kugou (酷狗), an unofficial source used only when the user turns Chinese sources
//! on. Three plain requests, no key or login (the same ones Lyricify-Lyrics-Helper, Apache-2.0,
//! sends: Providers/Web/Kugou/Api.cs): search songs for the track's hash, find lyrics for that
//! hash, then download them as KRC (krc.rs).

use serde_json::Value;

use super::found::{browser_client, from_lines, FoundLyrics};
use super::krc;
use super::scoring::{Candidate, Playing};
use super::search;

const SONG_SEARCH: &str = "http://mobilecdn.kugou.com/api/v3/search/song";
const LYRICS_SEARCH: &str = "https://lyrics.kugou.com/search";
const LYRICS_DOWNLOAD: &str = "https://lyrics.kugou.com/download";

/// The songs a search lists: id is the hash and the length in ms.
pub(super) fn candidates(search: &Value) -> Vec<Candidate<(String, i64)>> {
    let Some(songs) = search["data"]["info"].as_array() else { return Vec::new() };
    songs
        .iter()
        .filter_map(|song| {
            let length = song["duration"].as_i64().unwrap_or(0) * 1000;
            Some(Candidate {
                id: (song["hash"].as_str()?.to_string(), length),
                name: song["songname"].as_str()?.to_string(),
                singer: song["singername"].as_str().unwrap_or_default().to_string(),
                album: song["album_name"].as_str().unwrap_or_default().to_string(),
                duration_ms: length,
            })
        })
        .collect()
}

async fn get_json(client: &reqwest::Client, url: &str, query: &[(&str, String)]) -> Result<Value, String> {
    let url = reqwest::Url::parse_with_params(url, query).map_err(|error| error.to_string())?;
    let response = client.get(url).send().await.map_err(|error| format!("Could not reach Kugou: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("Kugou answered {}", response.status()));
    }
    response.json().await.map_err(|error| format!("Kugou sent something unexpected: {error}"))
}

async fn lyrics_of_hash(client: &reqwest::Client, hash: &str, length: i64, title: &str) -> Result<Option<FoundLyrics>, String> {
    let candidates = get_json(client, LYRICS_SEARCH, &[
        ("ver", "1".into()),
        ("man", "yes".into()),
        ("client", "pc".into()),
        ("hash", hash.to_string()),
        ("duration", length.to_string()),
    ])
    .await?;
    let Some(candidate) = candidates["candidates"].as_array().and_then(|all| all.first()) else {
        return Ok(None);
    };
    let (Some(id), Some(key)) = (candidate["id"].as_str(), candidate["accesskey"].as_str()) else {
        return Ok(None);
    };
    let download = get_json(client, LYRICS_DOWNLOAD, &[
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
    Ok(from_lines(&lines, krc::translations(&text).as_deref(), title).map(|found| found.with_duration(length)))
}

/// Synced lyrics and the match score, with a translation when Kugou has one. `Ok(None)` when it
/// has none for the track.
pub(super) async fn fetch(playing: &Playing<'_>) -> Result<Option<(FoundLyrics, u32)>, String> {
    let client = browser_client()?;
    let top = search::find(playing, |keyword| {
        let client = client.clone();
        async move {
            let query = [("format", "json".into()), ("keyword", keyword), ("page", "1".into()), ("pagesize", "20".into())];
            Ok(candidates(&get_json(&client, SONG_SEARCH, &query).await?))
        }
    })
    .await?;
    let mut last_error = None;
    for (score, (hash, length)) in top.into_iter().take(search::TOP) {
        match lyrics_of_hash(&client, &hash, length, playing.title).await {
            Ok(Some(found)) => return Ok(Some((found, score))),
            Ok(None) => {}
            Err(error) => last_error = Some(error),
        }
    }
    last_error.map_or(Ok(None), Err)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn songs_are_listed_with_hash_length_and_names() {
        let search = json!({ "data": { "info": [
            { "hash": "a", "songname": "余香", "singername": "张小九", "album_name": "专辑", "duration": 246 },
            { "songname": "no hash" },
        ] } });
        let found = candidates(&search);
        assert_eq!(found.len(), 1);
        assert_eq!((found[0].id.clone(), found[0].duration_ms), (("a".to_string(), 246_000), 246_000));
        assert_eq!(found[0].album, "专辑");
        assert!(candidates(&json!({})).is_empty());
    }
}
