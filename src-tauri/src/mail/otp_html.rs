// Adapted from Renly1994/xiaotang-daozai (MIT), src/otp.rs and src/mail_format.rs.
// Copyright (c) 2026 小唐的Token and Daozai contributors
// Full MIT notice: docs/third-party-licenses.md

use regex::Regex;
use std::sync::OnceLock;

fn pattern(slot: &'static OnceLock<Option<Regex>>, literal: &str) -> Option<&'static Regex> {
    slot.get_or_init(|| Regex::new(literal).ok()).as_ref()
}

/// Removes hidden preheaders as well as scripts, styles, comments and document metadata.
fn visible_html(html: &str) -> String {
    static TAG: OnceLock<Option<Regex>> = OnceLock::new();
    static HIDDEN: OnceLock<Option<Regex>> = OnceLock::new();
    static INERT: OnceLock<Option<Regex>> = OnceLock::new();
    let Some(inert) = pattern(
        &INERT,
        r"(?is)<!--.*?-->|<(?:script|style|head)\b[^>]*>.*?</(?:script|style|head)\s*>",
    ) else {
        return String::new();
    };
    let html = inert.replace_all(html, " ");
    let Some(tag) = pattern(
        &TAG,
        r#"(?is)<\s*(/?)\s*([a-z][a-z0-9:-]*)\b((?:"[^"]*"|'[^']*'|[^'">])*)>"#,
    ) else {
        return String::new();
    };
    let Some(hidden) = pattern(
        &HIDDEN,
        r#"(?is)(?:^|\s)hidden(?:\s|=|/|$)|\bstyle\s*=\s*["'][^"']*(?:display\s*:\s*none|mso-hide\s*:\s*all|visibility\s*:\s*hidden)[^"']*["']"#,
    ) else {
        return String::new();
    };
    let mut out = String::with_capacity(html.len());
    let mut stack: Vec<String> = Vec::new();
    let mut cursor = 0;
    for cap in tag.captures_iter(&html) {
        let Some(hit) = cap.get(0) else { continue };
        let name = cap[2].to_ascii_lowercase();
        let attrs = &cap[3];
        if stack.is_empty() {
            out.push_str(&html[cursor..hit.start()]);
        }
        if &cap[1] == "/" {
            if let Some(at) = stack.iter().rposition(|n| n == &name) {
                stack.truncate(at);
            } else if stack.is_empty() {
                out.push_str(hit.as_str());
            }
        } else {
            let skip = !stack.is_empty() || hidden.is_match(attrs);
            if !skip {
                out.push_str(hit.as_str());
            }
            if skip
                && !attrs.trim_end().ends_with('/')
                && !matches!(
                    name.as_str(),
                    "area"
                        | "base"
                        | "br"
                        | "col"
                        | "embed"
                        | "hr"
                        | "img"
                        | "input"
                        | "link"
                        | "meta"
                        | "param"
                        | "source"
                        | "track"
                        | "wbr"
                )
            {
                stack.push(name);
            }
        }
        cursor = hit.end();
    }
    if stack.is_empty() {
        out.push_str(&html[cursor..]);
    }
    out
}

pub(super) fn html_to_text(html: &str) -> String {
    static TAGS: OnceLock<Option<Regex>> = OnceLock::new();
    static BREAK: OnceLock<Option<Regex>> = OnceLock::new();
    let (Some(tags), Some(br)) = (
        pattern(&TAGS, r"(?s)<[^>]+>"),
        pattern(&BREAK, r"(?i)<br\s*/?>|</p>|</div>|</tr>|</li>|</h[1-6]>"),
    ) else {
        return String::new();
    };
    let visible = visible_html(html);
    let lines = br.replace_all(&visible, "\n");
    decode(&tags.replace_all(&lines, ""))
        .lines()
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

pub(super) fn emphasized(html: &str) -> Vec<String> {
    static TAGS: OnceLock<Option<Regex>> = OnceLock::new();
    let Some(re) = pattern(
        &TAGS,
        concat!(
            r"(?is)<(?:b|strong|h[1-6])\b[^>]*>(.*?)</(?:b|strong|h[1-6])>|",
            r#"<span\b[^>]*font-size:\s*(?:2\d|3\d|4\d)px[^>]*>(.*?)</span>"#
        ),
    ) else {
        return Vec::new();
    };
    re.captures_iter(&visible_html(html))
        .filter_map(|cap| cap.get(1).or_else(|| cap.get(2)))
        .map(|hit| html_to_text(hit.as_str()))
        .filter(|text| !text.is_empty())
        .collect()
}

fn decode(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(index) = rest.find('&') {
        out.push_str(&rest[..index]);
        let tail = &rest[index..];
        let end = tail
            .as_bytes()
            .iter()
            .take(11)
            .position(|&byte| byte == b';');
        let Some(end) = end else {
            out.push('&');
            rest = &tail[1..];
            continue;
        };
        let entity = &tail[1..end];
        let decoded = match entity {
            "nbsp" | "#160" | "ensp" | "emsp" | "thinsp" | "#8194" | "#8195" | "#8201" => Some(' '),
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" | "#39" => Some('\''),
            "middot" | "#183" | "bull" | "#8226" => Some('·'),
            "mdash" => Some('—'),
            "ndash" => Some('–'),
            "hellip" => Some('…'),
            "copy" => Some('©'),
            "reg" => Some('®'),
            // 零宽字符与软连字符交给 `clean` 统一清除，这里先映射成实体本身。
            "zwnj" => Some('\u{200c}'),
            "zwj" => Some('\u{200d}'),
            "shy" => Some('\u{00ad}'),
            other => other
                .strip_prefix("#x")
                .or_else(|| other.strip_prefix("#X"))
                .and_then(|hex| u32::from_str_radix(hex, 16).ok())
                .or_else(|| {
                    other
                        .strip_prefix('#')
                        .and_then(|dec| dec.parse::<u32>().ok())
                })
                .and_then(char::from_u32),
        };
        match decoded {
            Some(ch) => {
                out.push(ch);
                rest = &tail[end + 1..];
            }
            None => {
                out.push('&');
                rest = &tail[1..];
            }
        }
    }
    out.push_str(rest);
    out
}
