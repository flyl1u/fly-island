//! Apple Music's TTML lyrics, turned into the enhanced LRC the island shows.
//! Apple sends one `<p>` per sung line, with `<span>`s inside it carrying the
//! word times, and the translations under `<iTunesMetadata>`. The file is read
//! with a small hand-written parser, as the project takes no XML dependency.

use std::collections::HashMap;

use super::word_formats::timed_text;

/// The default namespace of the TTML root.
const TTML_NS: &str = "http://www.w3.org/ns/ttml";

/// The content of an element: text and child elements, in the order they come.
enum Content<'a> {
    Text(&'a str),
    Child(Element<'a>),
}

/// One XML element with its attributes.
struct Element<'a> {
    name: &'a str,
    attrs: Vec<(String, String)>,
    content: Vec<Content<'a>>,
}

impl<'a> Element<'a> {
    fn attr(&self, name: &str) -> Option<&str> {
        self.attrs.iter().find(|(key, _)| key == name).map(|(_, value)| value.as_str())
    }
}

/// The words of a line: when they start, how long they last, and their text.
type Words = Vec<(u64, u64, String)>;

/// The sung lines of a TTML file, and the translation of each line.
#[expect(
    clippy::type_complexity,
    reason = "the lyrics module calls the parser with this shape of answer"
)]
pub(super) fn parse_ttml(ttml: &str) -> Option<(Vec<(u64, String)>, Vec<String>)> {
    let mut cursor = 0;
    let document = parse_content(ttml, &mut cursor, None)?;
    let root = document.iter().find_map(|item| match item {
        Content::Child(element) if element.name == "tt" => Some(element),
        _ => None,
    })?;
    if root.attr("xmlns").is_some_and(|namespace| namespace != TTML_NS) {
        return None;
    }

    let mut paragraphs = Vec::new();
    find_all(root, "p", &mut paragraphs);
    if paragraphs.is_empty() {
        return None;
    }
    let (subtitles, replacements) = translations(root);

    let mut lines = Vec::new();
    let mut keys = Vec::new();
    for paragraph in paragraphs {
        // The background vocals are sung too, but they are not lines of the song.
        if paragraph.attr("ttm:role") == Some("x-bg") {
            continue;
        }
        let Some(start) = paragraph.attr("begin").and_then(parse_time_ms) else {
            continue;
        };
        let mut words = Words::new();
        let mut pending = String::new();
        collect_words(&paragraph.content, &mut words, &mut pending);
        // Word times that overlap cannot be shown, so the line falls back to plain text.
        let text = timed_text(&words).unwrap_or_else(|| plain_line(&paragraph.content));
        lines.push((start, text));
        keys.push(paragraph.attr("itunes:key").map(str::to_string));
    }
    if lines.is_empty() {
        return None;
    }

    let mut translated = vec![String::new(); lines.len()];
    for (index, key) in keys.iter().enumerate() {
        let Some(key) = key else { continue };
        if let Some(subtitle) = subtitles.get(key) {
            translated[index] = subtitle.clone();
        } else if let Some(replacement) = replacements.get(key) {
            lines[index].1 = replacement.clone();
        }
    }
    Some((lines, translated))
}

/// The subtitle of each line, and the line each replacement takes the place of.
fn translations(root: &Element<'_>) -> (HashMap<String, String>, HashMap<String, String>) {
    let mut subtitles = HashMap::new();
    let mut replacements = HashMap::new();
    let mut elements = Vec::new();
    find_all(root, "translation", &mut elements);
    for element in elements {
        let map = match element.attr("type") {
            Some("subtitle") => &mut subtitles,
            Some("replacement") => &mut replacements,
            _ => continue,
        };
        for item in &element.content {
            let Content::Child(text) = item else { continue };
            if text.name != "text" {
                continue;
            }
            let Some(key) = text.attr("for") else { continue };
            map.entry(key.to_string()).or_insert_with(|| plain_line(&text.content));
        }
    }
    (subtitles, replacements)
}

/// The words of a line, with the spaces that open them given to the word before.
fn collect_words(content: &[Content<'_>], words: &mut Words, pending: &mut String) {
    for item in content {
        let element = match item {
            Content::Child(element) if element.name == "span" => element,
            // The space between two words stands on its own in the markup.
            Content::Text(text) => {
                pending.extend(text.chars().filter(|character| *character == ' ' || *character == '\t'));
                continue;
            }
            Content::Child(_) => continue,
        };
        let Some(begin) = element.attr("begin").and_then(parse_time_ms) else {
            // A span without a time of its own holds the words.
            collect_words(&element.content, words, pending);
            continue;
        };
        let end = element.attr("end").and_then(parse_time_ms).unwrap_or(begin);
        let mut text = format!("{pending}{}", text_of(&element.content));
        pending.clear();
        text.retain(|character| character != '\r' && character != '\n');
        let opening = text.len() - text.trim_start().len();
        if opening > 0 {
            let space = text[..opening].contains(' ') || text[..opening].contains('\t');
            text = text[opening..].to_string();
            // A space that opens a word belongs to the word before it.
            if space {
                if let Some(previous) = words.last_mut() {
                    previous.2.push(' ');
                }
            }
        }
        if text.is_empty() {
            continue;
        }
        words.push((begin, end.saturating_sub(begin), text));
    }
}

/// The text of an element, without its tags.
fn text_of(content: &[Content<'_>]) -> String {
    let mut text = String::new();
    for item in content {
        match item {
            Content::Child(element) => text.push_str(&text_of(&element.content)),
            Content::Text(value) => text.push_str(value),
        }
    }
    decode(&text)
}

/// The text of a line, without its tags and without the formatting of the markup.
fn plain_line(content: &[Content<'_>]) -> String {
    let mut line = String::new();
    let mut space = false;
    for character in text_of(content).chars() {
        if character.is_whitespace() {
            space = true;
            continue;
        }
        if space && !line.is_empty() {
            line.push(' ');
        }
        space = false;
        line.push(character);
    }
    line
}

/// The entities Apple writes in lyric text.
fn decode(text: &str) -> String {
    let mut result = String::new();
    let mut rest = text;
    while let Some(at) = rest.find('&') {
        result.push_str(&rest[..at]);
        let Some(end) = rest[at..].find(';') else {
            result.push('&');
            result.push_str(&rest[at + 1..]);
            return result;
        };
        let entity = &rest[at + 1..at + end];
        let decoded = match entity {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            _ => entity
                .strip_prefix("#x")
                .and_then(|number| u32::from_str_radix(number, 16).ok())
                .or_else(|| entity.strip_prefix('#').and_then(|number| number.parse().ok()))
                .and_then(char::from_u32),
        };
        match decoded {
            Some(character) => result.push(character),
            None => result.push_str(&rest[at..=at + end]),
        }
        rest = &rest[at + end + 1..];
    }
    result.push_str(rest);
    result
}

/// A time of TTML, such as "1:02.5", "1:02:03.25" or "12.5s", in milliseconds.
fn parse_time_ms(value: &str) -> Option<u64> {
    let value = value.trim();
    let value = value.strip_suffix('s').or_else(|| value.strip_suffix('S')).unwrap_or(value);
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    if value.contains(':') {
        let parts: Vec<&str> = value.split(':').collect();
        return match parts.len() {
            2 => {
                let minutes: f64 = parts[0].trim().parse().ok()?;
                let seconds: f64 = parts[1].trim().parse().ok()?;
                Some((minutes * 60_000.0 + seconds * 1000.0).round() as u64)
            }
            3 => {
                let hours: f64 = parts[0].trim().parse().ok()?;
                let minutes: f64 = parts[1].trim().parse().ok()?;
                let seconds: f64 = parts[2].trim().parse().ok()?;
                Some((hours * 3_600_000.0 + minutes * 60_000.0 + seconds * 1000.0).round() as u64)
            }
            _ => {
                let seconds: f64 = value.replace(':', ".").parse().ok()?;
                Some((seconds * 1000.0).round() as u64)
            }
        };
    }
    let seconds: f64 = value.parse().ok()?;
    Some((seconds * 1000.0).round() as u64)
}

/// Every element with the given name, in the order the document has them.
fn find_all<'text, 'node>(element: &'node Element<'text>, name: &str, out: &mut Vec<&'node Element<'text>>) {
    for item in &element.content {
        let Content::Child(child) = item else { continue };
        if child.name == name {
            out.push(child);
        }
        find_all(child, name, out);
    }
}

/// The elements and text of `text`, up to the close tag of the parent.
fn parse_content<'a>(text: &'a str, cursor: &mut usize, closing: Option<&str>) -> Option<Vec<Content<'a>>> {
    let mut items: Vec<Content<'a>> = Vec::new();
    loop {
        let Some(at) = text[*cursor..].find('<') else {
            if closing.is_some() {
                return None;
            }
            items.push(Content::Text(&text[*cursor..]));
            *cursor = text.len();
            return Some(items);
        };
        let at = *cursor + at;
        if at > *cursor {
            items.push(Content::Text(&text[*cursor..at]));
        }
        if text[at..].starts_with("</") {
            let end = at + text[at..].find('>')?;
            if closing != Some(text[at + 2..end].trim()) {
                return None;
            }
            *cursor = end + 1;
            return Some(items);
        }
        if text[at..].starts_with("<!--") {
            *cursor = at + text[at..].find("-->")? + 3;
            continue;
        }
        if text[at..].starts_with("<![CDATA[") {
            let end = at + text[at..].find("]]>")?;
            items.push(Content::Text(&text[at + 9..end]));
            *cursor = end + 3;
            continue;
        }
        if text[at..].starts_with("<?") || text[at..].starts_with("<!") {
            *cursor = at + text[at..].find('>')? + 1;
            continue;
        }
        let tag = parse_start_tag(text, at)?;
        *cursor = tag.after;
        let content = if tag.self_closing { Vec::new() } else { parse_content(text, cursor, Some(tag.name))? };
        items.push(Content::Child(Element { name: tag.name, attrs: tag.attrs, content }));
    }
}

/// A tag in the markup: its name, its attributes, whether it closes itself
/// and where the markup after it starts.
struct StartTag<'a> {
    name: &'a str,
    attrs: Vec<(String, String)>,
    self_closing: bool,
    after: usize,
}

/// The tag at `at`.
fn parse_start_tag(text: &str, at: usize) -> Option<StartTag<'_>> {
    let rest = &text[at + 1..];
    let name_end = rest.find(|character: char| character.is_whitespace() || character == '>' || character == '/')?;
    let name = &rest[..name_end];
    let bytes = rest.as_bytes();
    let mut attrs = Vec::new();
    let mut index = name_end;
    loop {
        while index < bytes.len() && (bytes[index] as char).is_whitespace() {
            index += 1;
        }
        match bytes.get(index) {
            None => return None,
            Some(b'>') => return Some(StartTag { name, attrs, self_closing: false, after: at + index + 2 }),
            Some(b'/') => {
                return Some(StartTag {
                    name,
                    attrs,
                    self_closing: bytes.get(index + 1) == Some(&b'>'),
                    after: at + index + 3,
                });
            }
            Some(_) => {}
        }
        let key_start = index;
        while index < bytes.len()
            && bytes[index] != b'='
            && bytes[index] != b'>'
            && bytes[index] != b'/'
            && !(bytes[index] as char).is_whitespace()
        {
            index += 1;
        }
        let key = rest[key_start..index].to_string();
        while index < bytes.len() && (bytes[index] as char).is_whitespace() {
            index += 1;
        }
        if bytes.get(index) != Some(&b'=') {
            return None;
        }
        index += 1;
        while index < bytes.len() && (bytes[index] as char).is_whitespace() {
            index += 1;
        }
        let quote = *bytes.get(index)?;
        if quote != b'"' && quote != b'\'' {
            return None;
        }
        index += 1;
        let value_start = index;
        let value_end = index + rest[index..].find(quote as char)?;
        attrs.push((key, rest[value_start..value_end].to_string()));
        index = value_end + 1;
    }
}

#[cfg(test)]
mod tests;
