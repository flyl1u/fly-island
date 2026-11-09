//! Kugou's KRC lyrics. A download is base64 of `krc1` followed by zlib data XORed with a fixed
//! 16-byte key (the same in every open-source reader, e.g. Lyricify-Lyrics-Helper,
//! Apache-2.0: Decrypter/Krc/Decrypter.cs). Decrypted, each line is `[start,length]` in ms with
//! `<offset,length,0>word` pieces, and a `[language:<base64 JSON>]` header holds a translation
//! per line (the content entry of type 1).

use std::io::Read;

use base64::{engine::general_purpose::STANDARD, Engine};
use flate2::read::ZlibDecoder;
use serde_json::Value;

use super::found::word_tag;

const KEY: [u8; 16] = [0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69];
/// Decrypted lyrics are a few KiB; anything far larger is not lyrics.
const MAX_TEXT_BYTES: u64 = 1024 * 1024;

/// The KRC text of a download's base64 `content`; `None` when it is not KRC.
pub(super) fn decrypt(content: &str) -> Option<String> {
    let raw = STANDARD.decode(content.trim()).ok()?;
    let body = raw.strip_prefix(b"krc1")?;
    let unmasked: Vec<u8> = body.iter().enumerate().map(|(index, byte)| byte ^ KEY[index % KEY.len()]).collect();
    let mut text = String::new();
    ZlibDecoder::new(unmasked.as_slice()).take(MAX_TEXT_BYTES).read_to_string(&mut text).ok()?;
    Some(text.trim_start_matches('\u{feff}').to_string())
}

/// One line of KRC: when it starts (ms), its words joined, and each word's timing.
#[derive(Debug, PartialEq, Eq)]
pub(super) struct KrcLine {
    pub(super) start_ms: u64,
    pub(super) text: String,
    pub(super) words: Vec<KrcWord>,
}

/// A word (or syllable) of a KRC line: when it starts after the line does, and for how long.
#[derive(Debug, PartialEq, Eq)]
pub(super) struct KrcWord {
    pub(super) offset_ms: u64,
    pub(super) duration_ms: u64,
    pub(super) text: String,
}

impl KrcLine {
    /// The line's text with a word time before each word and one after the last
    /// (enhanced LRC: `<00:17.51>Oh <00:17.80>I <00:19.75>`); the plain text when no word has text.
    pub(super) fn timed_text(&self) -> String {
        if self.words.iter().all(|word| word.text.trim().is_empty()) {
            return self.text.clone();
        }
        let mut timed = String::new();
        let mut end = self.start_ms;
        for word in &self.words {
            let start = self.start_ms + word.offset_ms;
            timed.push_str(&word_tag(start));
            timed.push_str(&word.text);
            end = end.max(start + word.duration_ms);
        }
        timed.push_str(&word_tag(end));
        timed.trim().to_string()
    }
}

/// The timed lines of KRC text, in order.
pub(super) fn lines(krc: &str) -> Vec<KrcLine> {
    krc.lines()
        .filter_map(|line| {
            let rest = line.trim().strip_prefix('[')?;
            let (timing, words) = rest.split_once(']')?;
            let start_ms = timing.split_once(',')?.0.parse().ok()?;
            Some(KrcLine { start_ms, text: words_of(words), words: timed_words(words) })
        })
        .collect()
}

/// `<0,150,0>张<150,250,0>小` -> `张小`.
fn words_of(words: &str) -> String {
    let mut text = String::new();
    let mut rest = words;
    while let Some(start) = rest.find('<') {
        text.push_str(&rest[..start]);
        match rest[start..].find('>') {
            Some(end) => rest = &rest[start + end + 1..],
            None => {
                rest = "";
            }
        }
    }
    text.push_str(rest);
    text.trim().to_string()
}

/// `<0,150,0>张<150,250,0>小` -> 张 at 0 for 150 ms, 小 at 150 for 250 ms. Text before the first
/// tag, or after a broken one, is dropped here (it still shows in the plain text).
fn timed_words(words: &str) -> Vec<KrcWord> {
    words
        .split('<')
        .skip(1)
        .filter_map(|piece| {
            let (timing, text) = piece.split_once('>')?;
            let mut numbers = timing.split(',').map(|number| number.trim().parse::<u64>());
            let (Some(Ok(offset_ms)), Some(Ok(duration_ms))) = (numbers.next(), numbers.next()) else {
                return None;
            };
            Some(KrcWord { offset_ms, duration_ms, text: text.to_string() })
        })
        .collect()
}

/// The translation of each timed line, in order, from the `[language:...]` header; `None`
/// without one.
pub(super) fn translations(krc: &str) -> Option<Vec<String>> {
    let start = krc.find("[language:")? + "[language:".len();
    let encoded = &krc[start..start + krc[start..].find(']')?];
    let json: Value = serde_json::from_slice(&STANDARD.decode(encoded.trim()).ok()?).ok()?;
    let translation = json["content"].as_array()?.iter().find(|content| content["type"] == 1)?;
    let lines: Vec<String> = translation["lyricContent"]
        .as_array()?
        .iter()
        .map(|words| words[0].as_str().unwrap_or_default().trim().to_string())
        .collect();
    (!lines.is_empty()).then_some(lines)
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::{write::ZlibEncoder, Compression};
    use std::io::Write;

    fn encrypt(text: &str) -> String {
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(text.as_bytes()).unwrap();
        let masked: Vec<u8> = encoder.finish().unwrap().iter().enumerate().map(|(i, byte)| byte ^ KEY[i % KEY.len()]).collect();
        STANDARD.encode([b"krc1".as_slice(), &masked].concat())
    }

    #[test]
    fn downloads_decrypt_to_timed_lines_with_their_translations() {
        let language = STANDARD.encode(r#"{"content":[{"language":0,"type":1,"lyricContent":[["哦 我相信昨天"],[""]]}],"version":1}"#);
        let krc = format!(
            "\u{feff}[ar:The Beatles]\n[language:{language}]\n[17518,4956]<0,285,0>Oh <285,407,0>I <692,1542,0>believe\n[22474,1000]<0,1000,0>\n"
        );
        let text = decrypt(&encrypt(&krc)).unwrap();
        assert!(text.starts_with("[ar:"));
        let parsed = lines(&text);
        assert_eq!(parsed.iter().map(|line| (line.start_ms, line.text.as_str())).collect::<Vec<_>>(), [(17_518, "Oh I believe"), (22_474, "")]);
        assert_eq!(parsed[0].words[1], KrcWord { offset_ms: 285, duration_ms: 407, text: "I ".into() });
        // Absolute word times, and the end of the last word.
        assert_eq!(parsed[0].timed_text(), "<00:17.51>Oh <00:17.80>I <00:18.21>believe<00:19.75>");
        assert_eq!(parsed[1].timed_text(), "");
        assert_eq!(translations(&text), Some(vec!["哦 我相信昨天".to_string(), String::new()]));
        assert_eq!(translations("[language:eyJjb250ZW50IjpbXSwidmVyc2lvbiI6MX0=]"), None);
        assert_eq!(decrypt("bm90IGtyYw=="), None);
    }
}
