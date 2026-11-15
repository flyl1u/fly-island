//! QQ Music's anonymous desktop QRC endpoint, with the existing web LRC protocol as fallback.
//! Search/LRC protocol reference: Renly1994/xiaotang-daozai src/lyrics.rs (MIT).
//! Copyright (c) 2026 小唐的Token and Daozai contributors
use super::{
    found::{browser_client, from_lines, lrc_lines, FoundLyrics},
    matching, qrc_cipher, word_formats,
};
use serde_json::{json, Value};

const REFERER: &str = "https://y.qq.com/";
const MUSICU: &str = "https://u.y.qq.com/cgi-bin/musicu.fcg";
const SEARCH: &str = "https://c.y.qq.com/soso/fcgi-bin/client_search_cp";
const LYRIC: &str = "https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg";

pub(super) fn track_id(id: Option<&str>) -> Option<&str> {
    id?.strip_prefix("QQ-").filter(|id| {
        !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_alphanumeric())
    })
}

async fn get(
    client: &reqwest::Client,
    url: &str,
    query: &[(&str, String)],
) -> Result<Value, String> {
    let url = reqwest::Url::parse_with_params(url, query).map_err(|e| e.to_string())?;
    client
        .get(url)
        .header("Referer", REFERER)
        .send()
        .await
        .map_err(|e| format!("Could not reach QQ Music: {e}"))?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| format!("QQ Music sent something unexpected: {e}"))
}

async fn call(
    client: &reqwest::Client,
    module: &str,
    method: &str,
    param: Value,
) -> Result<Value, String> {
    let data = json!({"comm":{"ct":24,"cv":0,"format":"json"},"req":{"module":module,"method":method,"param":param}});
    let answer = get(client, MUSICU, &[("data", data.to_string())]).await?;
    if answer["req"]["code"].as_i64() != Some(0) {
        return Err("QQ Music rejected the lyric request".into());
    }
    Ok(answer["req"]["data"].clone())
}

fn candidates(search: &Value, title: &str, artist: &str, duration: i64) -> Vec<(String, i64)> {
    let Some(items) = search.pointer("/data/song/list").and_then(Value::as_array) else {
        return Vec::new();
    };
    let mut found = items
        .iter()
        .filter_map(|song| {
            let artists = song["singer"]
                .as_array()?
                .iter()
                .filter_map(|s| s["name"].as_str())
                .collect::<Vec<_>>()
                .join(",");
            let length = song["interval"].as_i64().unwrap_or(0).saturating_mul(1000);
            let mid = song["songmid"].as_str()?;
            (matching::same_native_track(
                (title, artist, duration),
                (song["songname"].as_str()?, &artists, length),
            ) && !mid.is_empty()
                && mid.bytes().all(|b| b.is_ascii_alphanumeric()))
            .then(|| (mid.to_string(), length))
        })
        .collect::<Vec<_>>();
    if duration > 0 {
        found.sort_by_key(|(_, length)| duration.abs_diff(*length));
    }
    found.truncate(3);
    found
}

fn decoded(text: &str) -> Option<String> {
    if text.starts_with('<') || text.starts_with('[') {
        Some(text.to_string())
    } else {
        qrc_cipher::decrypt(text)
    }
}

fn lyrics_of(data: &Value, title: &str) -> Option<FoundLyrics> {
    let raw = decoded(data["lyric"].as_str()?)?;
    let timed = word_formats::qrc(&raw);
    let lines = if timed.is_empty() {
        lrc_lines(&raw)
    } else {
        timed
    };
    let translation = data["trans"].as_str().and_then(decoded).unwrap_or_default();
    let translated = lrc_lines(&translation);
    let translations = lines
        .iter()
        .map(|(ms, _)| {
            translated
                .iter()
                .find(|(at, _)| at.abs_diff(*ms) < 50)
                .map(|(_, text)| text.clone())
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    from_lines(&lines, Some(&translations), title)
}

async fn by_mid(
    client: &reqwest::Client,
    mid: &str,
    title: &str,
) -> Result<Option<FoundLyrics>, String> {
    let param = json!({"songMid":mid,"crypt":1,"ct":19,"cv":2111,"lrc_t":0,"qrc":1,"qrc_t":0,"roma":0,"trans":1,"trans_t":0,"type":0});
    if let Ok(data) = call(
        client,
        "music.musichallSong.PlayLyricInfo",
        "GetPlayLyricInfo",
        param,
    )
    .await
    {
        if let Some(found) = lyrics_of(&data, title) {
            return Ok(Some(found));
        }
    }
    let answer = get(
        client,
        LYRIC,
        &[
            ("songmid", mid.into()),
            ("format", "json".into()),
            ("nobase64", "1".into()),
        ],
    )
    .await?;
    Ok(lyrics_of(&answer, title))
}

pub(super) async fn fetch(
    title: &str,
    artist: &str,
    duration: i64,
    id: Option<&str>,
) -> Result<Option<FoundLyrics>, String> {
    let client = browser_client()?;
    if let Some(id) = track_id(id) {
        // SMTC's QQ- can carry a numeric songid; resolve it before using a songmid endpoint.
        let mid = if id.bytes().all(|b| b.is_ascii_digit()) {
            let param = json!({"song_id":id.parse::<u64>().ok()});
            call(
                &client,
                "music.pf_song_detail_svr",
                "get_song_detail_yqq",
                param,
            )
            .await
            .ok()
            .and_then(|data| data["track_info"]["mid"].as_str().map(str::to_string))
        } else {
            Some(id.to_string())
        };
        if let Some(mid) = mid {
            if let Ok(Some(found)) = by_mid(&client, &mid, title).await {
                return Ok(Some(found));
            }
        }
    }
    let answer = get(
        &client,
        SEARCH,
        &[
            ("w", format!("{title} {artist}")),
            ("format", "json".into()),
            ("p", "1".into()),
            ("n", "12".into()),
        ],
    )
    .await?;
    let mut last_error = None;
    for (mid, length) in candidates(&answer, title, artist, duration) {
        match by_mid(&client, &mid, title).await {
            Ok(Some(found)) => return Ok(Some(found.with_duration(length))),
            Ok(None) => {}
            Err(error) => last_error = Some(error),
        }
    }
    last_error.map_or(Ok(None), Err)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ids_and_search_reject_other_recordings() {
        assert_eq!(track_id(Some("QQ-123")), Some("123"));
        assert_eq!(track_id(Some("QQ-003Abc")), Some("003Abc"));
        assert_eq!(track_id(Some("QQ-1&x")), None);
        let search = json!({"data":{"song":{"list":[
            {"songmid":"live","songname":"Track (Live)","singer":[{"name":"Artist"}],"interval":120},
            {"songmid":"ok","songname":"Track","singer":[{"name":"Artist"}],"interval":120},
            {"songmid":"cover","songname":"Track","singer":[{"name":"Other"}],"interval":120}
        ]}}});
        assert_eq!(
            candidates(&search, "Track", "Artist", 120_000),
            [("ok".into(), 120_000)]
        );
        assert!(candidates(&search, "Track", "Artist", 150_000).is_empty());
    }
    #[test]
    fn qrc_and_plain_fallback_keep_translation() {
        let data = json!({"lyric":"<Lyric LyricContent=\"[1000,400]你(1000,400)\"/>","trans":"[00:01.00]You"});
        let found = lyrics_of(&data, "Track").unwrap();
        assert!(found.lrc.contains("<00:01.00>你<00:01.40>"));
        assert_eq!(found.translation.as_deref(), Some("[00:01.00]You\n"));
        assert!(lyrics_of(&json!({"lyric":"[00:01.00]你好"}), "Track").is_some());
        assert!(lyrics_of(&json!({"lyric":"broken"}), "Track").is_none());
    }

    #[test]
    #[ignore = "Requires anonymous QQ Music endpoints; no installed player needed"]
    fn live_qq_qrc_mid_id_and_search() {
        for id in [Some("QQ-0039MnYb0qxYhV"), Some("QQ-97773"), None] {
            let found = tauri::async_runtime::block_on(fetch("晴天", "周杰伦", 269_000, id))
                .unwrap()
                .unwrap();
            assert!(
                found.lrc.contains('<'),
                "QQ should return word times for this test song"
            );
            println!(
                "QQ {}: {} timed lines",
                id.unwrap_or("search"),
                found.lrc.lines().count()
            );
        }
    }
}
