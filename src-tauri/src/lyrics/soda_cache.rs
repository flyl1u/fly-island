//! Adapted from Renly1994/xiaotang-daozai src/soda_cache.rs (MIT).
//! Copyright (c) 2026 小唐的Token and Daozai contributors
//! Read only the committed LMDB snapshot; no LMDB locks, login data or audio are opened.
use super::{
    found::{from_lines, lrc_lines, FoundLyrics},
    krc,
    matching::same_native_track,
    soda_lmdb, soda_msgpack,
};
use serde_json::Value;
use std::{
    fs::File,
    io::Read,
    path::{Path, PathBuf},
};

// 汽水的缓存库会随播放量增长，几十 MB 很常见；上限只防异常文件。
const LIMIT: u64 = 256 * 1024 * 1024;

fn select(value: &Value, title: &str, artist: &str, duration: i64) -> Option<FoundLyrics> {
    let detail = value.pointer("/info/mediaDetail")?;
    let track = &detail["playable"];
    let artists = track["artists"]
        .as_array()?
        .iter()
        .map(|a| a["name"].as_str())
        .collect::<Option<Vec<_>>>()?
        .join(",");
    let actual = track["duration"].as_i64()?;
    if !same_native_track(
        (title, artist, duration),
        (track["name"].as_str()?, &artists, actual),
    ) {
        return None;
    }
    let lyric = &detail["lyrics"];
    let raw = lyric["content"].as_str()?;
    match lyric["type"].as_str()? {
        "krc" => krc::lyrics(raw, title),
        "lrc" => from_lines(&lrc_lines(raw), None, title),
        _ => None,
    }
    .map(|found| found.with_duration(actual))
}

fn read_path(path: &Path, title: &str, artist: &str, duration: i64) -> Option<FoundLyrics> {
    let file = File::open(path).ok()?;
    if file.metadata().ok()?.len() > LIMIT {
        return None;
    }
    let mut data = Vec::new();
    file.take(LIMIT + 1).read_to_end(&mut data).ok()?;
    if data.len() as u64 > LIMIT {
        return None;
    }
    let size = soda_lmdb::le(&data, 48, 4)?;
    if !(512..=65536).contains(&size) {
        return None;
    }
    let mut headers = vec![0; size * 2];
    File::open(path).ok()?.read_exact(&mut headers).ok()?;
    // A writer committed while copying: discard the snapshot and let the next lookup retry.
    if data.get(..headers.len())? != headers {
        return None;
    }
    soda_lmdb::entries(&data)?
        .into_iter()
        .filter_map(soda_msgpack::decode)
        .find_map(|value| select(&value, title, artist, duration))
}

pub(super) fn read(title: &str, artist: &str, duration: i64) -> Option<FoundLyrics> {
    let path = PathBuf::from(std::env::var_os("APPDATA")?).join("SodaMusic/LunaCacheV2/entries.db");
    read_path(&path, title, artist, duration)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn matches_metadata_and_converts_plaintext_krc() {
        let value = json!({"info":{"mediaDetail":{"playable":{"name":"歌","artists":[{"name":"甲"},{"name":"乙"}],"duration":120000},
            "lyrics":{"type":"krc","content":"[offset:25]\n[1000,500]<0,300,0>你<400,100,0>好"}}}});
        let found = select(&value, "歌", "乙/甲", 120_000).unwrap();
        assert!(found
            .lrc
            .contains("[00:01.02]<00:01.02>你<00:01.32><00:01.42>好<00:01.52>"));
        assert_eq!(found.duration_ms, Some(120_000));
        for (title, artist, duration) in [
            ("歌 (Live)", "甲/乙", 120_000),
            ("歌", "甲", 120_000),
            ("歌", "甲/乙", 150_000),
        ] {
            assert!(select(&value, title, artist, duration).is_none());
        }
        assert!(select(&json!({}), "歌", "甲", 0).is_none());
    }
}
