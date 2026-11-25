//! Scoring a search result against the playing track, and the queries to find it with. Adapted
//! from H0308/taskbar-lyrics-displayer (Apache-2.0), `src/lyric/lyric_matching.cpp`:
//! `normalizeTitle`, `jaroWinkler`, `extractVersionTags`, `scoreCandidate`, `buildSearchVariants`
//! and `makeSearchQuery`. Where this differs: the length is a strong constraint (a few seconds off
//! costs a lot, past 8 s a result is dropped), only version words that change the recording count
//! as versions (a remaster does not), and the album breaks ties. Pure functions.

use std::collections::BTreeSet;

use super::artist_match::artist_similarity;
use super::matching::fold;
use crate::win32::chinese::to_simplified;

/// A result must score at least this to be used (the reference uses the same 80).
pub(super) const SCORE_THRESHOLD: u32 = 80;
/// Past this much difference in length a result is another recording.
const MAX_DURATION_DIFF_MS: i64 = 8000;

/// What plays: the SMTC fields the lookup was asked for.
#[derive(Debug, Clone, Copy)]
pub(super) struct Playing<'a> {
    pub(super) title: &'a str,
    pub(super) artist: &'a str,
    pub(super) album: &'a str,
    pub(super) duration_ms: i64,
}

/// A search result as a source lists it; 0 / empty for what it does not say.
#[derive(Debug, Clone, Copy, Default)]
pub(super) struct Listed<'a> {
    pub(super) name: &'a str,
    pub(super) singer: &'a str,
    pub(super) album: &'a str,
    pub(super) duration_ms: i64,
}

/// Lowercase, full-width folded, whitespace collapsed, written in simplified Chinese.
pub(super) fn simplified_fold(text: &str) -> String {
    fold(&to_simplified(text).unwrap_or_else(|| text.to_string()))
}

fn is_separator(c: char) -> bool {
    c.is_whitespace() || (c.is_ascii() && !c.is_ascii_alphanumeric()) || "，。、；：！？（）【】《》「」『』—–…·".contains(c)
}

/// Words that say nothing about which recording: "(Deluxe)", "- Remastered 2011", "[Explicit]".
const NOISE_WORDS: &[&str] = &[
    "explicit", "deluxe", "digital", "premium", "album", "edit", "edition", "version", "special", "anniversary", "studio",
    "remaster", "remastered", "mono", "stereo", "single", "bonus", "track",
];

fn is_noise(content: &str) -> bool {
    let mut any = false;
    for token in content.split(|c: char| is_separator(c)).filter(|token| !token.is_empty()) {
        if !(NOISE_WORDS.contains(&token) || token.chars().all(|c| c.is_ascii_digit())) {
            return false;
        }
        any = true;
    }
    any
}

fn closing_bracket(open: char) -> Option<char> {
    match open {
        '(' => Some(')'),
        '[' => Some(']'),
        '（' => Some('）'),
        '【' => Some('】'),
        _ => None,
    }
}

fn is_feature_note(content: &str) -> bool {
    let content = content.trim_start();
    ["feat.", "feat ", "ft.", "ft ", "featuring ", "with "].iter().any(|word| content.starts_with(word))
}

/// The text with " feat. X" cut off at its first occurrence.
fn strip_feature_suffix(text: &str) -> &str {
    let cut = [" feat.", " feat ", " ft.", " ft ", " featuring "].iter().filter_map(|marker| text.find(marker)).filter(|&at| at > 0).min();
    cut.map_or(text, |at| text[..at].trim_end())
}

/// A title as compared: simplified, lowercase, "feat." parts and noise brackets and a noise
/// " - suffix" removed, other bracket contents kept, every separator one space.
pub(super) fn normalize_title(title: &str) -> String {
    let folded = simplified_fold(title);
    let mut text = strip_feature_suffix(&folded).to_string();
    if let Some((head, tail)) = text.rsplit_once(" - ") {
        if is_noise(tail) {
            text = head.to_string();
        }
    }
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::new();
    let mut index = 0;
    while index < chars.len() {
        let c = chars[index];
        if let Some(close) = closing_bracket(c) {
            if let Some(length) = chars[index + 1..].iter().position(|&other| other == close) {
                let content: String = chars[index + 1..index + 1 + length].iter().collect();
                if !is_noise(&content) && !is_feature_note(&content) {
                    out.push(' ');
                    out.push_str(&content);
                    out.push(' ');
                }
                index += length + 2;
                continue;
            }
        }
        out.push(c);
        index += 1;
    }
    let mut collapsed = String::new();
    for c in out.chars() {
        if is_separator(c) {
            if !collapsed.is_empty() && !collapsed.ends_with(' ') {
                collapsed.push(' ');
            }
        } else {
            collapsed.push(c);
        }
    }
    collapsed.trim().to_string()
}

/// Jaro-Winkler similarity, 0.0..=1.0 (the reference's `jaroWinkler`).
pub(super) fn jaro_winkler(a: &str, b: &str) -> f64 {
    let (a, b): (Vec<char>, Vec<char>) = (a.chars().collect(), b.chars().collect());
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    if a == b {
        return 1.0;
    }
    let distance = (a.len().max(b.len()) / 2).saturating_sub(1);
    let (mut a_matched, mut b_matched) = (vec![false; a.len()], vec![false; b.len()]);
    let mut matches = 0usize;
    for (i, &ca) in a.iter().enumerate() {
        let start = i.saturating_sub(distance);
        let end = (i + distance + 1).min(b.len());
        for j in start..end {
            if !b_matched[j] && ca == b[j] {
                a_matched[i] = true;
                b_matched[j] = true;
                matches += 1;
                break;
            }
        }
    }
    if matches == 0 {
        return 0.0;
    }
    let (mut transpositions, mut j) = (0usize, 0usize);
    for (i, &ca) in a.iter().enumerate() {
        if !a_matched[i] {
            continue;
        }
        while !b_matched[j] {
            j += 1;
        }
        if ca != b[j] {
            transpositions += 1;
        }
        j += 1;
    }
    let m = matches as f64;
    let mut score = (m / a.len() as f64 + m / b.len() as f64 + (m - transpositions as f64 / 2.0) / m) / 3.0;
    if score > 0.7 {
        let prefix = a.iter().zip(&b).take(4).take_while(|(x, y)| x == y).count();
        score += prefix as f64 * 0.1 * (1.0 - score);
    }
    score.clamp(0.0, 1.0)
}

/// 0..=100 how alike two titles are; 0 below 0.5 (the reference's `titleSimilarity`).
pub(super) fn title_similarity(a: &str, b: &str) -> u32 {
    let (na, nb) = (normalize_title(a), normalize_title(b));
    if na.is_empty() || nb.is_empty() {
        return 0;
    }
    let score = jaro_winkler(&na, &nb);
    if score < 0.5 {
        0
    } else {
        (score * 100.0).round() as u32
    }
}

/// Words that name another recording of the song, by the tag they stand for. A remaster, a
/// deluxe edition or "version" alone are the same recording and have no tag.
const VERSION_WORDS: &[(&str, &[&str])] = &[
    ("live", &["live", "现场", "演唱会", "concert"]),
    ("remix", &["remix", "混音"]),
    ("acoustic", &["acoustic", "unplugged", "不插电"]),
    ("instrumental", &["instrumental", "karaoke", "伴奏", "纯音乐"]),
    ("demo", &["demo", "小样"]),
    ("special", &["dj", "剧情", "加速", "降调", "sped up", "slowed", "nightcore", "变速"]),
    ("clip", &["抖音", "片段", "剪辑", "clip", "tiktok", "short version", "铃声"]),
    ("cover", &["cover", "翻唱"]),
    ("ai", &["ai翻唱", "ai cover", "ai版", "ai声库"]),
    ("japanese", &["japanese", "日文", "日语", "日本语"]),
    ("english", &["english", "英文", "英语"]),
    ("cantonese", &["cantonese", "粤语"]),
    ("chinese", &["chinese", "中文", "国语", "普通话"]),
];

fn contains_word(text: &str, word: &str) -> bool {
    let ascii_word = word.chars().all(|c| c.is_ascii_alphanumeric() || c == ' ' || c == '.');
    let mut from = 0;
    while let Some(found) = text[from..].find(word) {
        let start = from + found;
        let end = start + word.len();
        let left = start == 0 || !ascii_word || !text[..start].chars().next_back().is_some_and(|c| c.is_ascii_alphanumeric());
        let right = end >= text.len() || !ascii_word || !text[end..].chars().next().is_some_and(|c| c.is_ascii_alphanumeric());
        if left && right {
            return true;
        }
        from = end;
    }
    false
}

/// The version tags a title carries: those named in its brackets, after its last dash, or by its
/// last word. A standalone "(AI)" in a bracket also counts, but not "Ai" in a title.
pub(super) fn version_tags(title: &str) -> BTreeSet<&'static str> {
    let text = simplified_fold(title);
    let chars: Vec<char> = text.chars().collect();
    let mut segments: Vec<String> = Vec::new();
    let mut index = 0;
    while index < chars.len() {
        if let Some(close) = closing_bracket(chars[index]) {
            if let Some(length) = chars[index + 1..].iter().position(|&other| other == close) {
                segments.push(chars[index + 1..index + 1 + length].iter().collect());
                index += length + 2;
                continue;
            }
        }
        index += 1;
    }
    let dash = [" - ", " – ", " — ", "-", "–", "—"].iter().filter_map(|sep| text.rfind(sep).map(|at| at + sep.len())).max();
    if let Some(at) = dash {
        segments.push(text[at..].to_string());
    }
    if !text.trim_end().ends_with([')', ']', '）', '】']) {
        segments.push(text.split_whitespace().next_back().unwrap_or_default().to_string());
    }
    let mut tags = BTreeSet::new();
    for segment in &segments {
        for (tag, words) in VERSION_WORDS {
            if words.iter().any(|word| contains_word(segment, word)) {
                tags.insert(*tag);
            }
        }
    }
    if segments.iter().any(|segment| contains_word(segment, "ai")) {
        tags.insert("ai");
    }
    tags
}

/// 1.0 for a length within a second, falling to 0.8 at 3 s and to 0 at 8 s; `None` past that.
fn duration_similarity(playing_ms: i64, listed_ms: i64) -> Option<f64> {
    let diff = (playing_ms - listed_ms).abs();
    match diff {
        0..=1000 => Some(1.0),
        1001..=3000 => Some(1.0 - (diff - 1000) as f64 / 2000.0 * 0.2),
        3001..=MAX_DURATION_DIFF_MS => Some(0.8 - (diff - 3000) as f64 / 5000.0 * 0.8),
        _ => None,
    }
}

fn useful_artist(artist: &str) -> bool {
    let artist = artist.trim().to_lowercase();
    !artist.is_empty() && artist != "unknown artist" && artist != "未知歌手" && artist != "unknown"
}

/// 0..=100 how surely `listed` is the playing recording; 0 rules it out. Title, singers and
/// length weigh in; another version word, an unknown singer mismatch or a length far off rule it out.
pub(super) fn score(playing: &Playing, listed: &Listed) -> u32 {
    let title = title_similarity(playing.title, listed.name);
    if title == 0 {
        return 0;
    }
    let has_artist = useful_artist(playing.artist) && useful_artist(listed.singer);
    let artist = if has_artist { artist_similarity(playing.artist, listed.singer) } else { 0 };
    if has_artist && artist == 0 {
        return 0;
    }
    let duration = if playing.duration_ms > 0 && listed.duration_ms > 0 {
        match duration_similarity(playing.duration_ms, listed.duration_ms) {
            Some(similarity) => Some(similarity),
            None => return 0,
        }
    } else {
        None
    };
    let (title, artist) = (f64::from(title) / 100.0, f64::from(artist) / 100.0);
    let mut total = match (has_artist, duration) {
        (true, Some(duration)) => title * 0.40 + artist * 0.25 + duration * 0.35,
        (true, None) => title * 0.60 + artist * 0.40,
        (false, Some(duration)) => title * 0.65 + duration * 0.35,
        (false, None) => title,
    };
    if version_tags(playing.title) != version_tags(listed.name) {
        total -= 0.40;
    }
    // The album only breaks ties between the same recording on different releases.
    if !playing.album.trim().is_empty() && normalize_title(playing.album) == normalize_title(listed.album) {
        total += 0.03;
    }
    (total.clamp(0.0, 1.0) * 100.0).round() as u32
}

/// A search result with the id a source fetches its lyrics by.
#[derive(Debug, Clone)]
pub(super) struct Candidate<T> {
    pub(super) id: T,
    pub(super) name: String,
    pub(super) singer: String,
    pub(super) album: String,
    pub(super) duration_ms: i64,
}

/// The candidates scoring at least the threshold, best first (equal scores keep their order,
/// and an id seen twice counts once).
pub(super) fn ranked<T: Clone + PartialEq>(playing: &Playing, candidates: &[Candidate<T>]) -> Vec<(u32, T)> {
    let mut ranked: Vec<(u32, T)> = Vec::new();
    for candidate in candidates {
        let listed = Listed { name: &candidate.name, singer: &candidate.singer, album: &candidate.album, duration_ms: candidate.duration_ms };
        let score = score(playing, &listed);
        if score >= SCORE_THRESHOLD && !ranked.iter().any(|(_, id)| *id == candidate.id) {
            ranked.push((score, candidate.id.clone()));
        }
    }
    ranked.sort_by_key(|(score, _)| std::cmp::Reverse(*score));
    ranked
}

fn trim_trailing_brackets(text: &str) -> String {
    let mut text = text.trim().to_string();
    while let Some(last) = text.chars().next_back() {
        let open = match last {
            ')' => '(',
            '）' => '（',
            ']' => '[',
            '】' => '【',
            _ => break,
        };
        let Some(start) = text.rfind(open).filter(|&at| at > 0) else { break };
        text.truncate(start);
        text = text.trim_end().to_string();
    }
    text
}

/// The first singer of a field with several ("A feat. B" / "A、B").
fn primary_artist(artist: &str) -> String {
    let lower = artist.to_lowercase();
    let mut cut = artist.len();
    for marker in [" feat.", " feat ", " ft.", " ft ", " featuring ", " with ", " vs "] {
        if let Some(at) = lower.find(marker) {
            cut = cut.min(at);
        }
    }
    artist[..cut].split(['/', '、', '&', ';', '；', ',', '，', '×']).next().unwrap_or(artist).trim().to_string()
}

fn strip_delimited_version_suffix(title: &str) -> String {
    for sep in [" - ", " – ", " — "] {
        if let Some(at) = title.rfind(sep) {
            if !version_tags(&title[at + sep.len()..]).is_empty() {
                return title[..at].trim().to_string();
            }
        }
    }
    title.to_string()
}

fn title_ends_with_artist(title: &str, artist: &str) -> bool {
    let (title, artist) = (title.to_lowercase(), artist.to_lowercase());
    !artist.is_empty() && [" - ", "-", " – ", "–", " — ", "—", " / ", "/"].iter().any(|sep| title.len() > sep.len() + artist.len() && title.ends_with(&format!("{sep}{artist}")))
}

/// The search words to try, most specific first: the title and artist as given, in simplified
/// Chinese, normalized, with the first singer only, and without a version note or "feat." part.
/// Each distinct one is worth one request; at most `limit`.
pub(super) fn search_keywords(title: &str, artist: &str, limit: usize) -> Vec<String> {
    let simple = |text: &str| to_simplified(text).unwrap_or_else(|| text.to_string());
    let mut variants: Vec<(String, String)> = Vec::new();
    fn add(variants: &mut Vec<(String, String)>, title: String, artist: String) {
        let (title, artist) = (title.trim().to_string(), artist.trim().to_string());
        if !title.is_empty() && !variants.contains(&(title.clone(), artist.clone())) {
            variants.push((title, artist));
        }
    }
    let stripped = trim_trailing_brackets(strip_feature_suffix(title));
    add(&mut variants, title.to_string(), artist.to_string());
    add(&mut variants, simple(title), simple(artist));
    add(&mut variants, title.to_string(), primary_artist(artist));
    add(&mut variants, stripped.clone(), artist.to_string());
    add(&mut variants, strip_delimited_version_suffix(&stripped), artist.to_string());
    add(&mut variants, normalize_title(title), normalize_title(artist));
    let count = variants.len();
    for index in 0..count {
        let (variant_title, variant_artist) = variants[index].clone();
        add(&mut variants, simple(&variant_title), simple(&variant_artist));
    }
    let mut keywords: Vec<String> = Vec::new();
    for (variant_title, variant_artist) in variants {
        let keyword = if variant_artist.is_empty() || title_ends_with_artist(&variant_title, &variant_artist) {
            variant_title
        } else {
            format!("{variant_title} {variant_artist}")
        };
        if !keywords.contains(&keyword) {
            keywords.push(keyword);
        }
    }
    keywords.truncate(limit);
    keywords
}

#[cfg(test)]
#[path = "scoring_tests.rs"]
mod tests;
