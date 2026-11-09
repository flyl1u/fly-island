//! Telling whether lyrics found by name belong to the track that plays: titles and artists are
//! compared after cleaning, and a found track must last about as long. Pure functions.

/// A found track may differ from the playing one by this much (LRCLIB's own limit is 2 s).
pub(super) const DURATION_TOLERANCE_MS: i64 = 3000;

/// Suffixes that name a version of a song rather than another song: "(Live)", "- Remastered 2011".
const VERSION_WORDS: &[&str] = &["live", "remaster", "remastered", "version", "edit", "mix", "mono", "stereo", "伴奏", "现场"];

/// Lowercase, full-width ASCII folded to half-width, whitespace collapsed.
pub(super) fn fold(text: &str) -> String {
    let folded: String = text
        .chars()
        .map(|c| match c {
            '\u{FF01}'..='\u{FF5E}' => char::from_u32(c as u32 - 0xFEE0).unwrap_or(c),
            '\u{3000}' => ' ',
            _ => c,
        })
        .flat_map(char::to_lowercase)
        .collect();
    folded.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// A title without "feat." parts and without a bracketed or dashed version note:
/// "晴天 (Live)" → "晴天", "Song - Remastered 2011" → "song", "Song (feat. X)" → "song".
pub(super) fn clean_title(title: &str) -> String {
    let mut text = fold(title);
    for open in ['(', '[', '【', '（'] {
        if let Some(start) = text.find(open) {
            let inner = &text[start..];
            if VERSION_WORDS.iter().any(|word| inner.contains(word)) || inner.contains("feat") || inner.contains("ft.") {
                text.truncate(start);
            }
        }
    }
    if let Some((head, tail)) = text.split_once(" - ") {
        if VERSION_WORDS.iter().any(|word| tail.contains(word)) {
            text = head.to_string();
        }
    }
    for marker in [" feat. ", " feat ", " ft. "] {
        if let Some(start) = text.find(marker) {
            text.truncate(start);
        }
    }
    text.trim().to_string()
}

/// The names in an artist field: "A, B & C" / "A / B" / "A、B" / "A feat. B".
fn artist_names(artists: &str) -> Vec<String> {
    let folded = fold(artists).replace(" feat. ", ",").replace(" ft. ", ",").replace(" & ", ",");
    folded
        .split([',', '/', '、', ';', '&'])
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_string)
        .collect()
}

/// Whether two artist fields share a name. An empty field (a player that sends none) matches.
pub(super) fn same_artist(a: &str, b: &str) -> bool {
    let (a, b) = (artist_names(a), artist_names(b));
    a.is_empty() || b.is_empty() || a.iter().any(|name| b.contains(name))
}

/// Whether a search result is the playing track: the same cleaned title and a shared artist,
/// both compared in simplified Chinese, and a close length (0 when not known).
pub(super) fn same_track(playing: (&str, &str, i64), found: (&str, &str, i64)) -> bool {
    let simple = |text: &str| crate::win32::chinese::to_simplified(text).unwrap_or_else(|| text.to_string());
    clean_title(&simple(found.0)) == clean_title(&simple(playing.0))
        && same_artist(&simple(found.1), &simple(playing.1))
        && close_duration(playing.2, found.2)
}

/// Whether a found track lasting `found_ms` can be the playing one lasting `playing_ms`. A
/// duration that is not known (0) does not rule anything out.
pub(super) fn close_duration(playing_ms: i64, found_ms: i64) -> bool {
    playing_ms <= 0 || found_ms <= 0 || (playing_ms - found_ms).abs() <= DURATION_TOLERANCE_MS
}

/// Common characters written differently in traditional Chinese; any of them in a text marks it
/// as traditional. Not a converter, only enough to tell the two apart in song titles and lyrics.
const TRADITIONAL_ONLY: &str = "們個這來時對說會為國與過還見裡開關點嗎聽買門問題經從後兩學頭電話車長際愛夢錯風雲讓將歲憶淚離間遠應聲樣無給隨盡難燈繼續萬髮臉憂鬱戀輕遙燒飄縷劃鎖鑰塵撣髒談顛飽滄調養記暫詳邊楊歡樂謝閃覺寫們歌語書紅綠藍誰變處張帶塊";

/// How many characters of `text` are written the traditional way.
pub(super) fn traditional_chars(text: &str) -> usize {
    text.chars().filter(|c| TRADITIONAL_ONLY.contains(*c)).count()
}

/// Whether the track is named in simplified Chinese: Chinese characters, none of them traditional.
pub(super) fn named_in_simplified(title: &str, artist: &str) -> bool {
    let name = format!("{title}{artist}");
    name.chars().any(|c| ('\u{4E00}'..='\u{9FFF}').contains(&c)) && traditional_chars(&name) == 0
}

/// The cache key of a track: cleaned title and artist, duration to the nearest 2 seconds.
pub(super) fn cache_key(title: &str, artist: &str, duration_ms: i64) -> String {
    format!("{}\u{1f}{}\u{1f}{}", clean_title(title), fold(artist), (duration_ms + 1000) / 2000)
}

/// FNV-1a, for cache file names that stay the same across builds.
pub(super) fn stable_hash(text: &str) -> u64 {
    text.bytes().fold(0xcbf2_9ce4_8422_2325, |hash, byte| (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn titles_lose_version_notes_and_featured_artists() {
        assert_eq!(clean_title("晴天 (Live)"), "晴天");
        assert_eq!(clean_title("Yesterday - Remastered 2009"), "yesterday");
        assert_eq!(clean_title("Song (feat. Someone)"), "song");
        assert_eq!(clean_title("Song feat. Someone"), "song");
        assert_eq!(clean_title("ＡＢＣ　（Live）"), "abc");
        // A bracket that is part of the name stays.
        assert_eq!(clean_title("七里香 (周杰伦)"), "七里香 (周杰伦)");
        assert_eq!(clean_title("Back - Home"), "back - home");
    }

    #[test]
    fn artists_match_when_they_share_a_name() {
        assert!(same_artist("周杰伦", "周杰倫, 周杰伦"));
        assert!(same_artist("Daft Punk feat. Pharrell Williams", "Pharrell Williams & Nile Rodgers"));
        assert!(same_artist("A / B", "b"));
        assert!(same_artist("", "Anyone"));
        assert!(!same_artist("Taylor Swift", "Taylor Swift Tribute Band"));
    }

    #[test]
    fn simplified_and_traditional_names_are_told_apart() {
        assert!(named_in_simplified("余香", "张小九"));
        assert!(!named_in_simplified("餘香", "張小九"));
        assert!(!named_in_simplified("Yesterday", "The Beatles"));
        assert_eq!(traditional_chars("劃一根火柴 將慵倦的夜點亮"), 3);
        assert_eq!(traditional_chars("划一根火柴 将慵倦的夜点亮"), 0);
    }

    #[test]
    fn durations_must_be_close_unless_unknown() {
        assert!(close_duration(200_000, 202_900));
        assert!(!close_duration(200_000, 204_000));
        assert!(close_duration(0, 120_000));
    }

    #[test]
    fn cache_keys_ignore_version_notes_and_small_duration_differences() {
        assert_eq!(cache_key("晴天 (Live)", "周杰伦", 269_000), cache_key("晴天", "周杰伦", 269_400));
        assert_ne!(cache_key("晴天", "周杰伦", 269_000), cache_key("晴天", "周杰伦", 300_000));
        assert_eq!(stable_hash("abc"), 0xe71f_a219_0541_574b);
    }
}
