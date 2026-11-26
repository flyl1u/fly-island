use std::sync::OnceLock;

use regex::Regex;
use serde::Deserialize;

pub(super) const MAX_LINE: usize = 1024;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Category {
    Island,
    Window,
    Fullscreen,
    Media,
    Weather,
    Plugin,
    Update,
    Startup,
}

impl Category {
    pub(super) fn label(self) -> &'static str {
        match self {
            Self::Island => "island",
            Self::Window => "window",
            Self::Fullscreen => "fullscreen",
            Self::Media => "media",
            Self::Weather => "weather",
            Self::Plugin => "plugin",
            Self::Update => "update",
            Self::Startup => "startup",
        }
    }
}

pub(super) fn truncate(text: &str, max: usize) -> &str {
    &text[..text.floor_char_boundary(max.min(text.len()))]
}

pub(super) fn line(timestamp: &str, body: &str, repeated: u64) -> String {
    let suffix = if repeated == 0 { String::new() } else { format!(" repeated={repeated}") };
    let available = MAX_LINE.saturating_sub(timestamp.len() + suffix.len() + 2);
    let short = if body.len() > available {
        format!("{}...", truncate(body, available.saturating_sub(3)))
    } else {
        body.to_owned()
    };
    format!("{timestamp} {short}{suffix}\n")
}

pub(super) fn body(category: Category, name: &str, fields: &[(&str, &str)]) -> String {
    use std::fmt::Write;
    let mut result = format!("[{}] {name}", category.label());
    for (key, value) in fields.iter().take(24) {
        let Some(value) = clean_field(key, truncate(value, 768)) else { continue };
        let value = if value.is_empty() || value.contains(|ch: char| ch.is_whitespace() || ch == '"' || ch.is_control()) {
            serde_json::Value::String(value).to_string()
        } else {
            value
        };
        let _ = write!(result, " {key}={value}");
        if result.len() >= MAX_LINE { break; }
    }
    result
}

fn clean_field(key: &str, value: &str) -> Option<String> {
    if matches!(key, "lat" | "lon" | "latitude" | "longitude") {
        return value.parse::<f64>().ok().filter(|number| number.is_finite()).map(|number| format!("{number:.1}"));
    }
    const PRIVATE: &[&str] = &["secret", "password", "authorization", "cookie", "token", "credential", "clipboard", "message", "content", "email", "text", "body"];
    if PRIVATE.iter().any(|part| key.contains(part)) {
        return None;
    }
    let lower = value.to_ascii_lowercase();
    if PRIVATE.iter().any(|part| lower.contains(&format!("{part}=")) || lower.contains(&format!("{part}:")))
        || lower.contains("bearer ") || lower.contains("://")
    {
        return Some("[redacted]".into());
    }
    static PROFILE: OnceLock<Option<Regex>> = OnceLock::new();
    let value = PROFILE.get_or_init(|| Regex::new(r"(?i)[a-z]:[/\\](?:users|documents and settings)[/\\][^/\\\r\n]+(?:[/\\]|$)").ok()).as_ref()
        .map_or_else(|| value.to_owned(), |pattern| pattern.replace_all(value, |matched: &regex::Captures<'_>| {
            let separator = matched[0].chars().next_back().filter(|last| matches!(last, '/' | '\\'));
            format!("%USERPROFILE%{}", separator.map_or(String::new(), |ch| ch.to_string()))
        }).into_owned());
    Some(value)
}

pub(super) fn legacy(source: &str, raw: &str) -> String {
    let source = match source {
        "main:error" | "main:warn" | "settings:error" | "settings:warn" | "translation:error" | "translation:warn"
        | "clipboard:error" | "clipboard:warn" | "workbuddy-auth" | "plugin" => source,
        _ => "rust",
    };
    let reason = if raw.contains("panicked at") { "panic" }
        else if raw.contains("http_401") { "http_401" }
        else if raw.contains("timed out") || raw.contains("timeout") { "timeout" }
        else if raw.contains("Permission denied") || raw.contains("Access is denied") { "access_denied" }
        else if raw.contains("could not start") || raw.contains("failed to initialize") { "initialization_failed" }
        else { "details_omitted" };
    format!("[legacy] report source={source} reason={reason}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_profile_paths_private_fields_and_exact_coordinates() {
        let value = body(Category::Weather, "locate", &[
            ("lat", "37.774929"), ("longitude", "-122.419416"), ("city", "San Francisco"),
            ("path", r"C:\Users\Ada\AppData\foo.log"), ("cookie", "PRIVATE"), ("detail", "token=PRIVATE"),
        ]);
        assert_eq!(value, r#"[weather] locate lat=37.8 longitude=-122.4 city="San Francisco" path=%USERPROFILE%\AppData\foo.log detail=[redacted]"#);
        assert!(!legacy("plugin", "Clipboard private text, xf=abc").contains("private"));
    }

    #[test]
    fn bounds_utf8_lines_and_keeps_the_repeat_suffix() {
        let body = body(Category::Island, "example", &[("first", &"岛".repeat(500)), ("second", &"屿".repeat(500))]);
        let value = line("2026-11-25 00:44:00.000", &body, 12);
        assert!(value.len() <= MAX_LINE);
        assert!(value.ends_with("... repeated=12\n"));
        assert_eq!(value.lines().count(), 1);
    }
}
