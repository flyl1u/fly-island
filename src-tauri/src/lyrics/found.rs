//! Lyrics as an online source gives them: timed lines, with a translation per line when the
//! source has one, turned into the LRC text the island shows. Credit lines ("作词：…") and a
//! leading "Artist - Title" line are dropped, as they are not sung.

use std::time::Duration;

use super::matching::{clean_title, fold};
use crate::system::updater::get_updater_proxy;

/// Synced lyrics in LRC, and the translation of the same lines in LRC when there is one.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct FoundLyrics {
    pub(super) lrc: String,
    pub(super) translation: Option<String>,
    /// The song's length as the source lists it, when known. Players that report no length
    /// (NetEase Cloud Music) get their progress bar from it.
    pub(super) duration_ms: Option<i64>,
}

impl FoundLyrics {
    /// The same lyrics with the source's length for the song; a length of 0 says nothing.
    pub(super) fn with_duration(self, duration_ms: i64) -> Self {
        Self { duration_ms: (duration_ms > 0).then_some(duration_ms), ..self }
    }
}

/// Words that start a credit line, before a colon: "作词：卡夫", "Composer: ...".
const CREDIT_WORDS: &[&str] = &[
    "作词", "作曲", "编曲", "词", "曲", "制作人", "制作", "监制", "和声", "混音", "母带", "录音", "吉他", "贝斯", "鼓",
    "键盘", "弦乐", "出品", "发行", "演唱", "原唱", "翻唱", "op", "sp", "lyrics", "lyricist", "composer", "arranger",
    "producer", "written by",
];

/// Whether a line credits someone rather than being sung.
pub(super) fn is_credit(text: &str, title: &str) -> bool {
    let text = fold(text);
    if let Some((head, _)) = text.split_once([':', '：']) {
        if CREDIT_WORDS.contains(&head.trim()) {
            return true;
        }
    }
    // "张小九 - 余香" or "Yesterday (Remaster) - The Beatles (披头士)", which some sources put
    // first: one side is the title. The artist is not compared, as sources add to it.
    let title = clean_title(title);
    !title.is_empty() && text.split_once(" - ").is_some_and(|(left, right)| clean_title(left) == title || clean_title(right) == title)
}

/// An enhanced-LRC word time, `<mm:ss.xx>`.
pub(super) fn word_tag(ms: u64) -> String {
    format!("<{:02}:{:02}.{:02}>", ms / 60_000, ms / 1000 % 60, ms % 1000 / 10)
}

/// `text` without enhanced-LRC word times.
pub(super) fn plain_text(text: &str) -> String {
    let mut plain = String::new();
    let mut rest = text;
    while let Some(start) = rest.find('<') {
        let tag = rest[start + 1..].find('>').map(|end| &rest[start + 1..start + 1 + end]);
        match tag.filter(|tag| !tag.is_empty() && tag.chars().all(|c| c.is_ascii_digit() || c == ':' || c == '.')) {
            Some(tag) => {
                plain.push_str(&rest[..start]);
                rest = &rest[start + tag.len() + 2..];
            }
            None => {
                plain.push_str(&rest[..=start]);
                rest = &rest[start + 1..];
            }
        }
    }
    plain.push_str(rest);
    plain
}

fn timestamp(ms: u64) -> String {
    format!("[{:02}:{:02}.{:02}]", ms / 60_000, ms / 1000 % 60, ms % 1000 / 10)
}

/// LRC from timed lines (ms, text, which may carry word times), credits dropped; translations, when given, follow the lines
/// by position. `None` when no sung line is left.
pub(super) fn from_lines(lines: &[(u64, String)], translations: Option<&[String]>, title: &str) -> Option<FoundLyrics> {
    let mut lrc = String::new();
    let mut translated = String::new();
    for (index, (ms, text)) in lines.iter().enumerate() {
        if is_credit(&plain_text(text), title) {
            continue;
        }
        lrc.push_str(&format!("{}{text}\n", timestamp(*ms)));
        if let Some(line) = translations.and_then(|all| all.get(index)).filter(|line| !line.is_empty()) {
            translated.push_str(&format!("{}{line}\n", timestamp(*ms)));
        }
    }
    let sung = lrc.lines().any(|line| plain_text(line).len() > 10);
    sung.then(|| FoundLyrics { lrc, translation: (!translated.is_empty()).then_some(translated), duration_ms: None })
}

/// Timed lines of an LRC text (the first time tag of each line), for sources that send LRC.
pub(super) fn lrc_lines(lrc: &str) -> Vec<(u64, String)> {
    lrc.lines()
        .filter_map(|line| {
            let rest = line.trim().strip_prefix('[')?;
            let (time, text) = rest.split_once(']')?;
            let (minutes, seconds) = time.split_once(':')?;
            let seconds: f64 = seconds.parse().ok()?;
            let ms = minutes.parse::<u64>().ok()? * 60_000 + (seconds * 1000.0).round() as u64;
            Some((ms, text.trim().to_string()))
        })
        .collect()
}

/// An HTTP client that looks like a browser, as the Chinese music sites expect, through the
/// updater's proxy.
pub(super) fn browser_client() -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36");
    if let Some(proxy) = get_updater_proxy() {
        builder = builder.proxy(reqwest::Proxy::all(&proxy).map_err(|error| format!("Invalid proxy {proxy}: {error}"))?);
    }
    builder.build().map_err(|error| format!("Could not create the HTTP client: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credits_and_the_heading_line_are_dropped() {
        assert!(is_credit("作词：卡夫", "余香"));
        assert!(is_credit("作曲 : 张小九", "余香"));
        assert!(is_credit("张小九 - 余香", "余香"));
        assert!(is_credit("Composer: Paul McCartney", "Yesterday"));
        assert!(is_credit("Yesterday (Remaster) - The Beatles (披头士)", "Yesterday"));
        assert!(!is_credit("Yesterday - all my troubles seemed so far away", "Something"));
        assert!(!is_credit("划一根火柴 将慵倦的夜点亮", "余香"));
        assert!(!is_credit("时间：慢慢调养", "余香"));
    }

    #[test]
    fn timed_lines_become_lrc_with_a_matching_translation() {
        let lines = [(201, "张小九 - 余香".to_string()), (1052, "作词：卡夫".to_string()), (31_440, "Oh I believe".to_string()), (75_005, String::new())];
        let translations = ["".to_string(), "".to_string(), "哦 我相信".to_string(), String::new()];
        let found = from_lines(&lines, Some(&translations), "余香").unwrap();
        assert_eq!(found.lrc, "[00:31.44]Oh I believe\n[01:15.00]\n");
        assert_eq!(found.translation.as_deref(), Some("[00:31.44]哦 我相信\n"));
        assert_eq!(from_lines(&lines[..2], None, "余香"), None);
        // Word times survive, and do not hide a credit.
        let timed = [(500, "<00:00.50>作词：<00:01.00>卡夫<00:02.00>".to_string()), (3000, "<00:03.00>划一根<00:04.00>".to_string())];
        assert_eq!(from_lines(&timed, None, "余香").unwrap().lrc, "[00:03.00]<00:03.00>划一根<00:04.00>
");
        assert_eq!(plain_text("<00:03.00>a<b> <x>c<00:04.00>"), "a<b> <x>c");
        assert_eq!(lrc_lines("[00:31.440]划一根\n[01:02.5]x\nno tag"), [(31_440, "划一根".to_string()), (62_500, "x".to_string())]);
    }
}
