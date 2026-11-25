//! Lyrics from NetEase Cloud Music (网易云音乐), an unofficial source used only when the user
//! turns Chinese sources on. The plain web endpoints need only a Referer, no key or login: a
//! song search, then the lyrics of a song id, which come as LRC with the translation as a second
//! LRC (`tlyric`). When the player says which NetEase song plays (the InfLink plugin puts
//! `NCM-<id>` among the genres), the search is skipped.

use serde_json::Value;

use super::found::{browser_client, from_lines, lrc_lines, FoundLyrics};
use super::scoring::{Candidate, Playing};
use super::{search, word_formats};

const SEARCH: &str = "http://music.163.com/api/search/get/web";
const LYRIC: &str = "https://music.163.com/api/song/lyric";
const WORD_LYRIC: &str = "https://music.163.com/api/song/lyric/v1";
const REFERER: &str = "https://music.163.com/";

/// The songs a search lists: id is the NetEase song id and the length in ms.
pub(super) fn candidates(search: &Value) -> Vec<Candidate<(u64, i64)>> {
    let Some(songs) = search["result"]["songs"].as_array() else { return Vec::new() };
    songs
        .iter()
        .filter_map(|song| {
            let singers: Vec<&str> = song["artists"].as_array()?.iter().filter_map(|artist| artist["name"].as_str()).collect();
            let length = song["duration"].as_i64().unwrap_or(0);
            Some(Candidate {
                id: (song["id"].as_u64()?, length),
                name: song["name"].as_str()?.to_string(),
                singer: singers.join(", "),
                album: song["album"]["name"].as_str().unwrap_or_default().to_string(),
                duration_ms: length,
            })
        })
        .collect()
}

/// The song id the player gave (`NCM-<id>`), if any.
pub(super) fn track_id(player_id: Option<&str>) -> Option<u64> {
    player_id?.strip_prefix("NCM-")?.parse().ok()
}

async fn get_json(client: &reqwest::Client, url: &str, query: &[(&str, String)]) -> Result<Value, String> {
    let url = reqwest::Url::parse_with_params(url, query).map_err(|error| error.to_string())?;
    let response = client
        .get(url)
        .header("Referer", REFERER)
        .send()
        .await
        .map_err(|error| format!("Could not reach NetEase: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("NetEase answered {}", response.status()));
    }
    response.json().await.map_err(|error| format!("NetEase sent something unexpected: {error}"))
}

/// The lyrics of a song id: its LRC with the translation lines matched by time.
pub(super) fn lyrics_of(answer: &Value, title: &str) -> Option<FoundLyrics> {
    let words = word_formats::yrc(answer["yrc"]["lyric"].as_str().unwrap_or_default());
    let has_words = !words.is_empty();
    let lines = if has_words { words } else { lrc_lines(answer["lrc"]["lyric"].as_str()?) };
    let translated = lrc_lines(if has_words { answer["ytlrc"]["lyric"].as_str() } else { None }
        .or_else(|| answer["tlyric"]["lyric"].as_str()).unwrap_or_default());
    let translations: Vec<String> = lines
        .iter()
        .map(|(ms, _)| translated.iter().find(|(at, _)| at.abs_diff(*ms) < 50).map(|(_, text)| text.clone()).unwrap_or_default())
        .collect();
    let has_translation = translations.iter().any(|line| !line.is_empty());
    from_lines(&lines, has_translation.then_some(translations.as_slice()), title)
}

async fn lyrics_of_id(client: &reqwest::Client, id: u64, length: i64, title: &str) -> Result<Option<FoundLyrics>, String> {
    let query = [("id", id.to_string()), ("lv", "-1".into()), ("kv", "-1".into()), ("tv", "-1".into()),
        ("yv", "-1".into()), ("ytv", "-1".into()), ("yrv", "-1".into()), ("cp", "false".into())];
    if let Ok(answer) = get_json(client, WORD_LYRIC, &query).await {
        if let Some(found) = lyrics_of(&answer, title) { return Ok(Some(found.with_duration(length))); }
    }
    let answer = get_json(client, LYRIC, &query).await?;
    Ok(lyrics_of(&answer, title).map(|found| found.with_duration(length)))
}

/// Synced lyrics and the match score, with a translation when NetEase has one. `Ok(None)` when
/// it has none. A song id from the player is trusted and skips the search.
pub(super) async fn fetch(playing: &Playing<'_>, player_id: Option<&str>) -> Result<Option<(FoundLyrics, u32)>, String> {
    let client = browser_client()?;
    if let Some(id) = track_id(player_id) {
        return Ok(lyrics_of_id(&client, id, 0, playing.title).await?.map(|found| (found, 100)));
    }
    let top = search::find(playing, |keyword| {
        let client = client.clone();
        async move {
            let query = [("s", keyword), ("type", "1".into()), ("offset", "0".into()), ("limit", "20".into())];
            Ok(candidates(&get_json(&client, SEARCH, &query).await?))
        }
    })
    .await?;
    let mut last_error = None;
    for (score, (id, length)) in top.into_iter().take(search::TOP) {
        match lyrics_of_id(&client, id, length, playing.title).await {
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
    fn songs_are_listed_with_id_length_and_names() {
        let search = json!({ "code": 200, "result": { "songs": [
            { "id": 2, "name": "余香", "artists": [{ "name": "张小九" }, { "name": "远Z" }], "album": { "name": "专辑" }, "duration": 228_816 },
            { "name": "no id", "artists": [] },
        ] } });
        let found = candidates(&search);
        assert_eq!(found.len(), 1);
        assert_eq!((found[0].id, found[0].singer.as_str(), found[0].album.as_str()), ((2, 228_816), "张小九, 远Z", "专辑"));
        assert_eq!(track_id(Some("NCM-487885426")), Some(487_885_426));
        assert_eq!(track_id(Some("QQ-123")), None);
        assert_eq!(track_id(None), None);
    }

    #[test]
    fn lyrics_come_with_the_translation_lines_matched_by_time() {
        let answer = json!({
            "lrc": { "lyric": "[00:00.000] 作词 : 卡夫\n[00:17.518]Oh I believe\n[00:22.000]in yesterday\n" },
            "tlyric": { "lyric": "[00:17.520]哦 我相信\n" },
        });
        let found = lyrics_of(&answer, "Yesterday").unwrap();
        assert_eq!(found.lrc, "[00:17.51]Oh I believe\n[00:22.00]in yesterday\n");
        assert_eq!(found.translation.as_deref(), Some("[00:17.51]哦 我相信\n"));
        assert_eq!(lyrics_of(&json!({ "lrc": { "lyric": "[00:00.00] 作词 : x\n" } }), "A"), None);
    }

    #[test]
    fn yrc_absolute_times_and_translation_precede_line_lyrics() {
        let answer = json!({"yrc":{"lyric":"[1000,500](1000,200,0)你(1300,200,0)好"},
            "ytlrc":{"lyric":"[00:01.00]Hello"},"lrc":{"lyric":"[00:02.00]old"}});
        let found = lyrics_of(&answer,"Song").unwrap();
        assert!(found.lrc.contains("[00:01.00]<00:01.00>你<00:01.20><00:01.30>好<00:01.50>"));
        assert_eq!(found.translation.as_deref(),Some("[00:01.00]Hello\n"));
        let fallback = json!({"yrc":{"lyric":"broken"},"lrc":{"lyric":"[00:02.00]旧歌词"}});
        assert!(lyrics_of(&fallback,"Song").unwrap().lrc.contains("旧歌词"));
    }

    #[test]
    #[ignore = "Requires anonymous NetEase endpoint; no installed player needed"]
    fn live_netease_yrc() {
        let playing = Playing { title: "测试", artist: "", album: "", duration_ms: 0 };
        let (found, _) = tauri::async_runtime::block_on(fetch(&playing, Some("NCM-1878313261"))).unwrap().unwrap();
        assert!(found.lrc.contains('<'));
        println!("NetEase YRC: {} timed lines", found.lrc.lines().count());
    }
}
