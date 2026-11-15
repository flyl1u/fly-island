//! Adapted from Renly1994/xiaotang-daozai src/kugou_cache.rs (MIT).
//! Copyright (c) 2026 小唐的Token and Daozai contributors
use super::{
    found::FoundLyrics,
    krc,
    matching::{close_duration, fold, native_artist_subset, same_native_track},
};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};

const LIMIT: u64 = 2 * 1024 * 1024;

fn directory_from_ini(bytes: &[u8]) -> Option<PathBuf> {
    let little = bytes.strip_prefix(&[0xff, 0xfe]).or_else(|| bytes.starts_with(b"[\0").then_some(bytes));
    let big = bytes.strip_prefix(&[0xfe, 0xff]).or_else(|| bytes.starts_with(b"\0[").then_some(bytes));
    let text = if let Some(bytes) = little {
        if !bytes.len().is_multiple_of(2) {
            return None;
        }
        String::from_utf16(
            &bytes
                .as_chunks::<2>().0.iter()
                .map(|b| u16::from_le_bytes([b[0], b[1]]))
                .collect::<Vec<_>>(),
        )
        .ok()?
    } else if let Some(bytes) = big {
        if !bytes.len().is_multiple_of(2) {
            return None;
        }
        String::from_utf16(
            &bytes
                .as_chunks::<2>().0.iter()
                .map(|b| u16::from_be_bytes([b[0], b[1]]))
                .collect::<Vec<_>>(),
        )
        .ok()?
    } else {
        String::from_utf8(bytes.to_vec()).ok()?
    };
    text.trim_start_matches('\u{feff}')
        .lines()
        .find_map(|line| {
            let (key, value) = line.split_once('=')?;
            let value = value.trim().trim_matches('"');
            (key.trim().eq_ignore_ascii_case("LyricPath") && !value.is_empty())
                .then(|| PathBuf::from(value))
        })
}

fn identity(stem: &str) -> Option<(&str, &str)> {
    let (artist, tail) = stem.split_once(" - ")?;
    let at = tail.match_indices('-').find_map(|(at, _)| {
        let suffix = &tail[at + 1..];
        let mut parts = suffix.split('-');
        let hash = parts.next()?;
        (hash.len() == 32
            && hash.bytes().all(|b| b.is_ascii_hexdigit())
            && parts.all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_hexdigit())))
        .then_some(at)
    })?;
    Some((&tail[..at], artist))
}

fn read_directory(root: &Path, title: &str, artist: &str, duration: i64) -> Option<FoundLyrics> {
    let mut files = fs::read_dir(root)
        .ok()?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            if !path.extension()?.eq_ignore_ascii_case("krc") {
                return None;
            }
            let (name, singer) = identity(path.file_stem()?.to_str()?)?;
            if !same_native_track((title, artist, duration), (name, singer, 0)) {
                return None;
            }
            let meta = entry.metadata().ok()?;
            (meta.is_file() && meta.len() <= LIMIT).then_some((meta.modified().ok(), path))
        })
        .collect::<Vec<_>>();
    files.sort_by_key(|a| std::cmp::Reverse(a.0));
    let mut fallback = None;
    for (_, path) in files {
        let raw = (|| {
            let mut bytes = Vec::new();
            fs::File::open(path)
                .ok()?
                .take(LIMIT + 1)
                .read_to_end(&mut bytes)
                .ok()?;
            krc::decrypt_bytes(&bytes)
        })();
        let Some(raw) = raw else {
            continue;
        };
        let name = krc::header(&raw, "ti")
            .filter(|s| !s.is_empty())
            .unwrap_or(title);
        let singer = krc::header(&raw, "ar")
            .filter(|s| !s.is_empty())
            .unwrap_or(artist);
        let total = krc::header(&raw, "total")
            .and_then(|n| n.parse().ok())
            .unwrap_or(0);
        if fold(title) != fold(name) || !native_artist_subset(artist, singer)
            || !close_duration(duration, total)
        {
            continue;
        }
        let Some(found) = krc::lyrics(&raw, title) else {
            continue;
        };
        if duration <= 0 || total > 0 {
            return Some(found);
        }
        if fallback.is_none() {
            fallback = Some(found);
        }
    }
    fallback
}

pub(super) fn read(title: &str, artist: &str, duration: i64) -> Option<FoundLyrics> {
    let ini = PathBuf::from(std::env::var_os("APPDATA")?).join("KuGou8/KuGou.ini");
    let configured = (|| {
        let mut bytes = Vec::new();
        fs::File::open(ini)
            .ok()?
            .take(65537)
            .read_to_end(&mut bytes)
            .ok()?;
        (bytes.len() <= 65536).then_some(())?;
        directory_from_ini(&bytes)
    })();
    if let Some(root) = configured {
        if let Some(found) = read_directory(&root, title, artist, duration) {
            return Some(found);
        }
    }
    let root = PathBuf::from(std::env::var_os("SystemDrive").unwrap_or_else(|| "C:".into()))
        .join("KuGou/Lyric");
    read_directory(&root, title, artist, duration)
}

#[cfg(test)]
#[path = "kugou_cache_tests.rs"]
mod tests;
