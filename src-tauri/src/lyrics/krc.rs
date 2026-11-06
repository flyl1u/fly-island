//! Kugou's KRC lyrics. A download is base64 of `krc1` followed by zlib data XORed with a fixed
//! 16-byte key (the same in every open-source reader, e.g. Lyricify-Lyrics-Helper,
//! Apache-2.0: Decrypter/Krc/Decrypter.cs). Decrypted, each line is `[start,length]` in ms with
//! `<offset,length,0>word` pieces, and a `[language:<base64 JSON>]` header holds a translation
//! per line (the content entry of type 1).

use std::io::Read;

use base64::{engine::general_purpose::STANDARD, Engine};
use flate2::read::ZlibDecoder;
use serde_json::Value;

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

/// One line of KRC: when it starts (ms) and its words joined.
#[derive(Debug, PartialEq, Eq)]
pub(super) struct KrcLine {
    pub(super) start_ms: u64,
    pub(super) text: String,
}

/// The timed lines of KRC text, in order.
pub(super) fn lines(krc: &str) -> Vec<KrcLine> {
    krc.lines()
        .filter_map(|line| {
            let rest = line.trim().strip_prefix('[')?;
            let (timing, words) = rest.split_once(']')?;
            let start_ms = timing.split_once(',')?.0.parse().ok()?;
            Some(KrcLine { start_ms, text: words_of(words) })
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
        assert_eq!(
            lines(&text),
            [KrcLine { start_ms: 17_518, text: "Oh I believe".into() }, KrcLine { start_ms: 22_474, text: String::new() }]
        );
        assert_eq!(translations(&text), Some(vec!["哦 我相信昨天".to_string(), String::new()]));
        assert_eq!(translations("[language:eyJjb250ZW50IjpbXSwidmVyc2lvbiI6MX0=]"), None);
        assert_eq!(decrypt("bm90IGtyYw=="), None);
    }
}
