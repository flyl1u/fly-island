//! Native QRC (postfix absolute word times) and YRC (prefix absolute word times).
use super::found::word_tag;

/// Preserve each word's end, including silences before the next word.
pub(super) fn timed_text(words: &[(u64, u64, String)]) -> Option<String> {
    let mut text = String::new();
    let mut end = 0;
    for (start, duration, word) in words {
        if *start < end || *start > 24 * 60 * 60 * 1000 {
            return None;
        }
        end = start.checked_add(*duration)?;
        text.push_str(&word_tag(*start));
        text.push_str(word);
        text.push_str(&word_tag(end));
    }
    (!words.is_empty()).then_some(text)
}

fn line_parts(line: &str) -> Option<(u64, &str)> {
    let (time, rest) = line.trim().strip_prefix('[')?.split_once(']')?;
    let (start, duration) = time.split_once(',')?;
    let start = start.parse::<u64>().ok()?;
    start.checked_add(duration.parse::<u64>().ok()?)?;
    Some((start, rest))
}

fn unescape(text: &str) -> String {
    let mut result = String::new();
    let mut rest = text;
    while let Some(at) = rest.find('&') {
        result.push_str(&rest[..at]);
        let Some(end) = rest[at..].find(';').filter(|end| *end < 16) else {
            result.push_str(&rest[at..]);
            return result;
        };
        let entity = &rest[at + 1..at + end];
        let decoded = match entity {
            "amp" => Some('&'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            "lt" => Some('<'),
            "gt" => Some('>'),
            _ => entity
                .strip_prefix("#x")
                .and_then(|n| u32::from_str_radix(n, 16).ok())
                .or_else(|| entity.strip_prefix('#').and_then(|n| n.parse().ok()))
                .and_then(char::from_u32),
        };
        match decoded {
            Some(c) => result.push(c),
            None => result.push_str(&rest[at..=at + end]),
        }
        rest = &rest[at + end + 1..];
    }
    result.push_str(rest);
    result
}

pub(super) fn qrc(xml: &str) -> Vec<(u64, String)> {
    let content = if let Some((_, rest)) = xml.split_once("LyricContent=") {
        let rest = rest.trim_start();
        let Some(quote) = rest.chars().next().filter(|c| *c == '"' || *c == '\'') else {
            return Vec::new();
        };
        let Some((value, _)) = rest[1..].split_once(quote) else {
            return Vec::new();
        };
        unescape(value)
    } else {
        xml.to_string()
    };
    content
        .lines()
        .filter_map(|line| {
            let (start, mut rest) = line_parts(line)?;
            let mut words = Vec::new();
            while !rest.is_empty() {
                let (open, end, time, duration) =
                    rest.match_indices('(').find_map(|(open, _)| {
                        let end = open + rest[open..].find(')')?;
                        let (time, duration) = rest[open + 1..end].split_once(',')?;
                        Some((
                            open,
                            end,
                            time.parse::<u64>().ok()?,
                            duration.parse::<u64>().ok()?,
                        ))
                    })?;
                words.push((time, duration, rest[..open].to_string()));
                rest = &rest[end + 1..];
            }
            if !rest.trim().is_empty() {
                return None;
            }
            Some((start, timed_text(&words)?))
        })
        .collect()
}

pub(super) fn yrc(raw: &str) -> Vec<(u64, String)> {
    raw.lines()
        .filter_map(|line| {
            let (start, mut rest) = line_parts(line)?;
            let mut words = Vec::new();
            while !rest.is_empty() {
                let (timing, tail) = rest.strip_prefix('(')?.split_once(')')?;
                let mut times = timing.split(',');
                let time = times.next()?.parse().ok()?;
                let duration = times.next()?.parse().ok()?;
                let end = tail.find('(').unwrap_or(tail.len());
                words.push((time, duration, tail[..end].to_string()));
                rest = &tail[end..];
            }
            Some((start, timed_text(&words)?))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn real_format_word_times_and_xml_entities() {
        let xml = "<QrcInfos><Lyric_1 LyricContent=\"[1000,2000]你(1000,400) &amp; 我(2000,500)&#10;[4000,10]啊(4000,10)\" /></QrcInfos>";
        let parsed = qrc(xml);
        assert_eq!(
            parsed[0],
            (
                1000,
                "<00:01.00>你<00:01.40><00:02.00> & 我<00:02.50>".into()
            )
        );
        assert_eq!(parsed.len(), 2);
        assert_eq!(
            yrc("{\"t\":0}\n[1000,2000](1000,400,0)你(2000,500,0) & 我"),
            parsed[..1]
        );
        assert!(yrc("[0,20](10,20,0)a(5,1,0)b").is_empty());
        assert!(qrc("[0,20]a(1,xx)").is_empty());
        assert!(qrc("<Lyric LyricContent=\"broken").is_empty());
        assert!(yrc("[0,1](18446744073709551615,2,0)a").is_empty());
        assert!(qrc("[1000,500]say (hi)(1000,500)")[0]
            .1
            .contains("say (hi)"));
    }
}
