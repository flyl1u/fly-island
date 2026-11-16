//! Lyrics from NetEase Cloud Music (网易云音乐), an unofficial source used only when the user
//! turns Chinese sources on. The plain web endpoints need only a Referer, no key or login: a
//! song search, then the lyrics of a song id, which come as LRC with the translation as a second
//! LRC (`tlyric`). When the player says which NetEase song plays (the InfLink plugin puts
//! `NCM-<id>` among the genres), the search is skipped.

use serde_json::Value;

use super::found::{browser_client, from_lines, lrc_lines, FoundLyrics};
use super::{matching::same_track, word_formats};

const SEARCH: &str = "http://music.163.com/api/search/get/web";
const LYRIC: &str = "https://music.163.com/api/song/lyric";
const WORD_LYRIC: &str = "https://music.163.com/api/song/lyric/v1";
const REFERER: &str = "https://music.163.com/";

/// The id and length of the search result that is the playing track; the closest length wins,
/// or the first result when the playing length is not known.
pub(super) fn best_song(search: &Value, title: &str, artist: &str, duration_ms: i64) -> Option<(u64, i64)> {
    search["result"]["songs"]
        .as_array()?
        .iter()
        .filter_map(|song| {
            let artists: Vec<&str> = song["artists"].as_array()?.iter().filter_map(|artist| artist["name"].as_str()).collect();
            let length = song["duration"].as_i64().unwrap_or(0);
            let found = (song["name"].as_str()?, artists.join(", "), length);
            same_track((title, artist, duration_ms), (found.0, &found.1, found.2)).then(|| (song["id"].as_u64(), length))
        })
        .filter_map(|(id, length)| Some((id?, length)))
        .enumerate()
        .min_by_key(|(index, (_, length))| if duration_ms > 0 { (duration_ms - length).abs() } else { *index as i64 })
        .map(|(_, found)| found)
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

/// Synced lyrics, with a translation when NetEase has one. `Ok(None)` when it has none.
pub(super) async fn fetch(title: &str, artist: &str, duration_ms: i64, player_id: Option<&str>) -> Result<Option<FoundLyrics>, String> {
    let client = browser_client()?;
    let (id, length) = match track_id(player_id) {
        Some(id) => (id, 0),
        None => {
            let keyword = format!("{title} {artist}").trim().to_string();
            let query = [("s", keyword), ("type", "1".into()), ("offset", "0".into()), ("limit", "20".into())];
            let search = get_json(&client, SEARCH, &query).await?;
            let Some(found) = best_song(&search, title, artist, duration_ms) else {
                return Ok(None);
            };
            found
        }
    };
    let query = [("id", id.to_string()), ("lv", "-1".into()), ("kv", "-1".into()), ("tv", "-1".into()),
        ("yv", "-1".into()), ("ytv", "-1".into()), ("yrv", "-1".into()), ("cp", "false".into())];
    if let Ok(answer) = get_json(&client, WORD_LYRIC, &query).await {
        if let Some(found) = lyrics_of(&answer, title) { return Ok(Some(found.with_duration(length))); }
    }
    let answer = get_json(&client, LYRIC, &query).await?;
    Ok(lyrics_of(&answer, title).map(|found| found.with_duration(length)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn the_search_result_must_be_the_playing_song() {
        let search = json!({ "code": 200, "result": { "songs": [
            { "id": 1, "name": "余香 (女声版)", "artists": [{ "name": "小匆匆" }], "duration": 244_000 },
            { "id": 2, "name": "余香", "artists": [{ "name": "张小九" }, { "name": "远Z" }], "duration": 228_816 },
            { "id": 3, "name": "余香", "artists": [{ "name": "张小九" }], "duration": 246_019 },
        ] } });
        assert_eq!(best_song(&search, "余香", "张小九", 246_000), Some((3, 246_019)));
        assert_eq!(best_song(&search, "余香", "张小九", 0), Some((2, 228_816)));
        assert_eq!(best_song(&search, "七里香", "周杰伦", 0), None);
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
        let found = tauri::async_runtime::block_on(fetch("测试", "", 0, Some("NCM-1878313261"))).unwrap().unwrap();
        assert!(found.lrc.contains('<'));
        println!("NetEase YRC: {} timed lines", found.lrc.lines().count());
    }
}
