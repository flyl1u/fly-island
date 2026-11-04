//! Session titles: pure parsing of the saved hook input, Claude Code transcripts and the Codex
//! session index. Both title formats are undocumented, so every parser returns `None` on anything
//! unexpected and the caller falls back to the next source.

use serde_json::Value;
use std::path::{Component, Path};

pub(super) const TITLE_MAX_CHARS: usize = 40;

/// The fields of a hook's stdin JSON that titles need.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct HookInput {
    pub(super) session_id: Option<String>,
    pub(super) transcript_path: Option<String>,
    pub(super) cwd: Option<String>,
    pub(super) prompt: Option<String>,
}

/// Parses the saved hook input. The capture script cuts lines past ~64 KiB, so when the JSON is
/// incomplete the complete string fields are still picked out one by one.
pub(super) fn parse_hook_input(text: &str) -> HookInput {
    let text = text.trim_start_matches('\u{feff}').trim();
    if let Ok(Value::Object(map)) = serde_json::from_str::<Value>(text) {
        let field = |key: &str| {
            map.get(key)
                .and_then(Value::as_str)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        };
        return HookInput {
            session_id: field("session_id"),
            transcript_path: field("transcript_path"),
            cwd: field("cwd"),
            prompt: field("prompt"),
        };
    }

    HookInput {
        session_id: lenient_string_field(text, "session_id", false),
        transcript_path: lenient_string_field(text, "transcript_path", false),
        cwd: lenient_string_field(text, "cwd", false),
        prompt: lenient_string_field(text, "prompt", true),
    }
}

/// Finds `"key": "value"` in possibly truncated JSON. A cut-off value is only accepted when
/// `allow_truncated` is set (the prompt, which is shortened for display anyway).
fn lenient_string_field(text: &str, key: &str, allow_truncated: bool) -> Option<String> {
    let needle = format!("\"{key}\"");
    let start = text.find(&needle)? + needle.len();
    let rest = text[start..].trim_start().strip_prefix(':')?.trim_start();
    let body = rest.strip_prefix('"')?;

    let mut escaped = false;
    for (index, character) in body.char_indices() {
        match character {
            _ if escaped => escaped = false,
            '\\' => escaped = true,
            '"' => return decode_json_string(&body[..index]).filter(|value| !value.is_empty()),
            _ => {}
        }
    }

    if !allow_truncated {
        return None;
    }
    // Drop a cut-off escape sequence at the end (at most `\uXXXX`) until the rest decodes.
    let mut end = body.len();
    for _ in 0..6 {
        if let Some(value) = decode_json_string(&body[..end]) {
            return Some(value).filter(|value| !value.is_empty());
        }
        end = body[..end].char_indices().last()?.0;
    }
    None
}

fn decode_json_string(raw: &str) -> Option<String> {
    serde_json::from_str::<String>(&format!("\"{raw}\"")).ok()
}

/// The newest `{"type":"ai-title","aiTitle":…}` record in a Claude Code transcript excerpt.
pub(super) fn latest_ai_title(transcript: &str) -> Option<String> {
    transcript
        .lines()
        .rev()
        .filter(|line| line.contains("\"ai-title\""))
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .filter(|record| record["type"] == "ai-title")
        .find_map(|record| record["aiTitle"].as_str().and_then(display_title))
}

/// The prompt title in one Claude Code transcript line, if it is a prompt the user typed: system
/// records, tool results and slash-command output are skipped.
pub(super) fn user_prompt_in_record(line: &str) -> Option<String> {
    if !line.contains("\"user\"") {
        return None;
    }
    let record = serde_json::from_str::<Value>(line).ok()?;
    if record["type"] != "user" || record["isMeta"] == Value::Bool(true) {
        return None;
    }
    user_message_text(&record["message"]["content"]).and_then(|text| prompt_title(&text))
}

fn user_message_text(content: &Value) -> Option<String> {
    let text = match content {
        Value::String(text) => text.clone(),
        Value::Array(blocks) => {
            if blocks.iter().any(|block| block["type"] == "tool_result") {
                return None;
            }
            blocks
                .iter()
                .filter(|block| block["type"] == "text")
                .filter_map(|block| block["text"].as_str())
                .collect::<Vec<_>>()
                .join(" ")
        }
        _ => return None,
    };

    let trimmed = text.trim_start();
    if trimmed.starts_with("<command-name>") {
        // A slash command such as `/goal …` carries what the user wrote in its arguments;
        // ones without arguments (`/model`) say nothing about the task.
        return tag_content(trimmed, "command-args")
            .filter(|args| !args.trim().is_empty())
            .map(str::to_string);
    }
    let is_command_output = ["<local-command", "Caveat:"]
        .iter()
        .any(|prefix| trimmed.starts_with(prefix));
    (!is_command_output).then_some(text)
}

fn tag_content<'a>(text: &'a str, tag: &str) -> Option<&'a str> {
    let open = format!("<{tag}>");
    let start = text.find(&open)? + open.len();
    let end = text[start..].find(&format!("</{tag}>"))?;
    Some(&text[start..start + end])
}

/// A prompt shortened for display: wrapper tags such as `<pasted_content …>`, `[Image #1]`
/// placeholders and a leading Markdown heading marker are removed, keeping the text the user wrote.
pub(super) fn prompt_title(prompt: &str) -> Option<String> {
    let text = strip_image_placeholders(&strip_tags(prompt));
    display_title(text.trim_start().trim_start_matches('#'))
}

fn strip_tags(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find('<') {
        result.push_str(&rest[..start]);
        let candidate = &rest[start..];
        let tag_end = candidate
            .find('>')
            .filter(|&end| is_tag(&candidate[1..end]));
        match tag_end {
            Some(end) => {
                result.push(' ');
                rest = &candidate[end + 1..];
            }
            None => {
                result.push('<');
                rest = &candidate[1..];
            }
        }
    }
    result.push_str(rest);
    result
}

/// `name attr="…"` or `/name`, on one line: enough to tell tags from text like `a < b > c`.
fn is_tag(inner: &str) -> bool {
    let name = inner.strip_prefix('/').unwrap_or(inner);
    name.starts_with(|character: char| character.is_ascii_alphabetic())
        && name.len() <= 200
        && !name.contains('\n')
}

fn strip_image_placeholders(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find("[Image #") {
        result.push_str(&rest[..start]);
        let after = &rest[start + "[Image #".len()..];
        let digits = after.len() - after.trim_start_matches(|c: char| c.is_ascii_digit()).len();
        if digits > 0 && after[digits..].starts_with(']') {
            result.push(' ');
            rest = &after[digits + 1..];
        } else {
            result.push('[');
            rest = &rest[start + 1..];
        }
    }
    result.push_str(rest);
    result
}

/// The newest `thread_name` for `session_id` in `~/.codex/session_index.jsonl`.
pub(super) fn codex_thread_name(index: &str, session_id: &str) -> Option<String> {
    index
        .lines()
        .rev()
        .filter(|line| line.contains(session_id))
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .filter(|record| record["id"].as_str() == Some(session_id))
        .find_map(|record| record["thread_name"].as_str().and_then(display_title))
}

/// The last folder of the session's working directory.
pub(super) fn folder_title(cwd: &str) -> Option<String> {
    let folder = Path::new(cwd.trim_end_matches(['\\', '/'])).file_name()?;
    display_title(&folder.to_string_lossy())
}

/// Collapses whitespace and cuts to `TITLE_MAX_CHARS` characters with an ellipsis.
pub(super) fn display_title(text: &str) -> Option<String> {
    shorten(text, TITLE_MAX_CHARS)
}

/// Collapses whitespace and cuts to `max_chars` characters (at least 2) with an ellipsis.
pub(super) fn shorten(text: &str, max_chars: usize) -> Option<String> {
    let collapsed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.is_empty() {
        return None;
    }
    if collapsed.chars().count() <= max_chars {
        return Some(collapsed);
    }
    let mut title = collapsed
        .chars()
        .take(max_chars.max(2) - 1)
        .collect::<String>()
        .trim_end()
        .to_string();
    title.push('…');
    Some(title)
}

/// Whether `path` is an absolute path inside `root`, without `..` (compared case-insensitively,
/// as on Windows). The hook input is outside data, so it must not name arbitrary files to read.
pub(super) fn is_path_inside(path: &Path, root: &Path) -> bool {
    if !path.is_absolute() || path.components().any(|part| part == Component::ParentDir) {
        return false;
    }
    let lower = |value: &Path| {
        value
            .components()
            .map(|part| part.as_os_str().to_string_lossy().to_lowercase())
            .collect::<Vec<_>>()
    };
    let (path, root) = (lower(path), lower(root));
    path.len() > root.len() && path.starts_with(&root)
}
