//! Agent sessions for the island's Agent page, read straight from the Claude Code and Codex
//! session files, so every recent session shows up whether or not it ran with FocuSD's hooks.
//! Pure parsing only; reading and caching the files is in session_scan.rs. Both formats are
//! undocumented, so anything unexpected is skipped rather than reported.

use serde::Serialize;
use serde_json::Value;

use super::session_host::SessionHost;
use super::title::{display_title, prompt_title, shorten, user_prompt_in_record};
use super::tool_call::{claude_tool_call, codex_tool_call, ToolCall};

/// The latest reply shown under each session.
pub(super) const LAST_MESSAGE_MAX_CHARS: usize = 120;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionSummary {
    pub(super) provider: &'static str,
    pub(super) session_id: String,
    pub(super) cwd: Option<String>,
    pub(super) title: Option<String>,
    /// "Opus 5.5" for Claude models, the raw name otherwise.
    pub(super) model: Option<String>,
    pub(super) effort: Option<String>,
    /// "running", "waiting" (asked the user mid-turn, Claude Code only), "completed", "failed" or
    /// "stale" (still working after a long silence).
    pub(super) phase: &'static str,
    pub(super) last_message: Option<String>,
    /// Last change of the session file, Unix milliseconds.
    pub(super) updated_at: i64,
    /// The program the session runs in, when known (session_host.rs).
    pub(super) host: Option<SessionHost>,
    /// When the newest prompt was sent, Unix milliseconds; how long the current (or last) turn
    /// has run is counted from here. `None` when the prompt is not in the excerpt read.
    pub(super) turn_started_at: Option<i64>,
    /// That newest prompt, shortened like a title.
    pub(super) last_prompt: Option<String>,
    /// The tool the current turn called last; `None` once the turn is over.
    pub(super) current_tool: Option<ToolCall>,
}

/// Where the newest turn of a session stands, before the age of the file is considered.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub(super) enum TurnState {
    #[default]
    Unknown,
    Working,
    Done,
    Failed,
}

/// What the end of a session file says. `None` fields were not found in the excerpt.
#[derive(Debug, Default, PartialEq, Eq)]
pub(super) struct SessionTail {
    pub(super) session_id: Option<String>,
    pub(super) cwd: Option<String>,
    pub(super) title: Option<String>,
    pub(super) model: Option<String>,
    pub(super) effort: Option<String>,
    pub(super) last_message: Option<String>,
    pub(super) state: TurnState,
    /// Timestamp of the newest prompt, Unix milliseconds.
    pub(super) turn_started_at: Option<i64>,
    pub(super) last_prompt: Option<String>,
    /// The newest tool call after the newest prompt, while the turn is still working.
    pub(super) current_tool: Option<ToolCall>,
}

impl SessionTail {
    /// A finished turn has no current tool.
    fn settle(mut self) -> Self {
        if self.state != TurnState::Working {
            self.current_tool = None;
        }
        self
    }
}

/// "2026-11-06T07:24:44.123Z" (or with an offset such as "+08:00") as Unix milliseconds.
pub(super) fn parse_timestamp_ms(text: &str) -> Option<i64> {
    let number = |range: std::ops::Range<usize>| text.get(range)?.parse::<i64>().ok();
    let bytes = text.as_bytes();
    if bytes.len() < 19 || bytes[4] != b'-' || bytes[7] != b'-' || !matches!(bytes[10], b'T' | b' ') {
        return None;
    }
    let (year, month, day) = (number(0..4)?, number(5..7)?, number(8..10)?);
    let (hour, minute, second) = (number(11..13)?, number(14..16)?, number(17..19)?);
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) || hour > 23 || minute > 59 || second > 60 {
        return None;
    }
    let mut rest = &text[19..];
    let mut millis = 0;
    if let Some(fraction) = rest.strip_prefix('.') {
        let digits = fraction.chars().take_while(char::is_ascii_digit).count();
        let first3: String = fraction[..digits].chars().chain("000".chars()).take(3).collect();
        millis = first3.parse::<i64>().ok()?;
        rest = &fraction[digits..];
    }
    let offset_minutes = match rest {
        "" | "Z" | "z" => 0,
        _ => {
            let sign = match rest.as_bytes()[0] { b'+' => 1, b'-' => -1, _ => return None };
            let digits: String = rest[1..].chars().filter(char::is_ascii_digit).collect();
            if digits.len() != 4 { return None; }
            sign * (digits[..2].parse::<i64>().ok()? * 60 + digits[2..].parse::<i64>().ok()?)
        }
    };
    // Days since 1970-01-01 for a proleptic Gregorian date (Howard Hinnant's days_from_civil).
    let y = if month <= 2 { year - 1 } else { year };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    let seconds = days * 86_400 + hour * 3_600 + minute * 60 + second - offset_minutes * 60;
    Some(seconds * 1_000 + millis)
}

/// Turns the state and the file age into the phase shown, using the same stale limit as the
/// running markers.
pub(super) fn session_phase(state: TurnState, idle_ms: i64, stale_after_ms: i64) -> &'static str {
    match state {
        TurnState::Failed => "failed",
        TurnState::Working if idle_ms >= stale_after_ms => "stale",
        TurnState::Working => "running",
        TurnState::Done | TurnState::Unknown => "completed",
    }
}

/// Reads a Claude Code transcript excerpt from its end.
pub(super) fn parse_claude_tail(tail: &str) -> SessionTail {
    let mut result = SessionTail::default();
    for record in tail
        .lines()
        .rev()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
    {
        let kind = record["type"].as_str().unwrap_or_default();
        if result.title.is_none() && kind == "ai-title" {
            result.title = record["aiTitle"].as_str().and_then(display_title);
        }
        if result.session_id.is_none() {
            result.session_id = string_field(&record, "sessionId");
        }
        if result.cwd.is_none() {
            result.cwd = string_field(&record, "cwd");
        }
        if !matches!(kind, "user" | "assistant") || record["isMeta"] == Value::Bool(true) {
            continue;
        }
        let message = &record["message"];
        if kind == "assistant" {
            let model = message["model"]
                .as_str()
                .filter(|model| *model != "<synthetic>");
            if result.model.is_none() {
                result.model = model.map(claude_model_label);
            }
            if result.effort.is_none() && model.is_some() {
                result.effort = string_field(&record, "effort");
            }
            if result.last_message.is_none() {
                result.last_message = text_blocks(&message["content"])
                    .and_then(|text| shorten(&text, LAST_MESSAGE_MAX_CHARS));
            }
            // Only tools called after the newest prompt belong to the current turn.
            if result.current_tool.is_none() && result.last_prompt.is_none() {
                result.current_tool = claude_tool_call(&message["content"]);
            }
        }
        if result.state == TurnState::Unknown {
            result.state = claude_turn_state(kind, &record);
        }
        // A prompt the user typed, not tool results, an interruption note or a command's output.
        if result.last_prompt.is_none() && kind == "user" {
            if let Some(prompt) = user_prompt_in_record(&record.to_string()) {
                result.last_prompt = Some(prompt);
                result.turn_started_at = record["timestamp"].as_str().and_then(parse_timestamp_ms);
            }
        }
    }
    result.settle()
}

fn claude_turn_state(kind: &str, record: &Value) -> TurnState {
    let message = &record["message"];
    if kind == "assistant" {
        if record["isApiErrorMessage"] == Value::Bool(true) {
            return TurnState::Failed;
        }
        return match message["stop_reason"].as_str() {
            Some("end_turn" | "stop_sequence" | "max_tokens" | "refusal") => TurnState::Done,
            _ => TurnState::Working,
        };
    }
    // A user record: a new prompt or tool results keep the turn going; an interruption ends it.
    let interrupted = text_blocks(&message["content"])
        .or_else(|| message["content"].as_str().map(str::to_string))
        .is_some_and(|text| text.contains("[Request interrupted by user"));
    if interrupted {
        TurnState::Done
    } else {
        TurnState::Working
    }
}

/// "claude-opus-5-5" or "group/auto-claude-opus-5-5" → "Opus 5.5"; other names unchanged.
pub(super) fn claude_model_label(model: &str) -> String {
    let name = model.rsplit('/').next().unwrap_or(model);
    let Some(rest) = name.split_once("claude-").map(|(_, rest)| rest) else {
        return name.to_string();
    };
    let mut parts = rest.split('-');
    let family = parts.next().unwrap_or_default();
    let version = parts
        .take_while(|part| part.chars().all(|c| c.is_ascii_digit()) && part.len() <= 2)
        .collect::<Vec<_>>()
        .join(".");
    let mut family_chars = family.chars();
    let family = family_chars
        .next()
        .map(|first| first.to_uppercase().chain(family_chars).collect::<String>())
        .unwrap_or_default();
    if version.is_empty() {
        family
    } else {
        format!("{family} {version}")
    }
}

/// Reads a Codex rollout excerpt from its end. The session id and folder come from the
/// `session_meta` record on the first line (see `parse_codex_meta`).
pub(super) fn parse_codex_tail(tail: &str) -> SessionTail {
    let mut result = SessionTail::default();
    for record in tail
        .lines()
        .rev()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
    {
        let payload = &record["payload"];
        let kind = record["type"].as_str().unwrap_or_default();
        let payload_kind = payload["type"].as_str().unwrap_or_default();
        if kind == "turn_context" {
            if result.model.is_none() {
                result.model = string_field(payload, "model");
            }
            if result.effort.is_none() {
                result.effort = string_field(payload, "effort");
            }
            if result.cwd.is_none() {
                result.cwd = string_field(payload, "cwd");
            }
        }
        // Only tools called after the newest prompt belong to the current turn.
        if kind == "response_item" && result.current_tool.is_none() && result.last_prompt.is_none() {
            result.current_tool = codex_tool_call(payload);
        }
        if kind != "event_msg" {
            continue;
        }
        if result.last_prompt.is_none() && payload_kind == "user_message" {
            result.last_prompt = payload["message"].as_str().and_then(prompt_title);
        }
        if result.last_message.is_none() {
            let text = match payload_kind {
                "agent_message" => payload["message"].as_str(),
                "task_complete" => payload["last_agent_message"].as_str(),
                _ => None,
            };
            result.last_message = text.and_then(|text| shorten(text, LAST_MESSAGE_MAX_CHARS));
        }
        if result.turn_started_at.is_none() && matches!(payload_kind, "user_message" | "task_started") {
            result.turn_started_at = record["timestamp"].as_str().and_then(parse_timestamp_ms);
        }
        if result.state == TurnState::Unknown {
            result.state = match payload_kind {
                "task_complete" if !payload["error"].is_null() => TurnState::Failed,
                "task_complete" | "turn_aborted" => TurnState::Done,
                "task_started" | "user_message" => TurnState::Working,
                _ => TurnState::Unknown,
            };
        }
    }
    result.settle()
}

/// `(session id, cwd)` from a Codex rollout's first line.
pub(super) fn parse_codex_meta(first_line: &str) -> Option<(String, Option<String>)> {
    let record = serde_json::from_str::<Value>(first_line).ok()?;
    if record["type"] != "session_meta" {
        return None;
    }
    let payload = &record["payload"];
    let id = string_field(payload, "id").or_else(|| string_field(payload, "session_id"))?;
    Some((id, string_field(payload, "cwd")))
}

/// Where a Codex session started ("Codex Desktop", "codex_cli_rs", ...), from the
/// `session_meta` record on the first line of its rollout.
pub(super) fn codex_originator(first_line: &str) -> Option<String> {
    let record = serde_json::from_str::<Value>(first_line).ok()?;
    (record["type"] == "session_meta")
        .then(|| string_field(&record["payload"], "originator"))
        .flatten()
}

/// The first prompt the user typed in a Codex rollout line, if this line is one.
pub(super) fn codex_user_prompt(line: &str) -> Option<String> {
    if !line.contains("\"user_message\"") {
        return None;
    }
    let record = serde_json::from_str::<Value>(line).ok()?;
    let payload = &record["payload"];
    (record["type"] == "event_msg" && payload["type"] == "user_message")
        .then(|| payload["message"].as_str())
        .flatten()
        .and_then(super::title::prompt_title)
}

/// The `cwd` a Claude Code transcript line records, if it has one.
pub(super) fn record_cwd(line: &str) -> Option<String> {
    if !line.contains("\"cwd\"") {
        return None;
    }
    let record = serde_json::from_str::<Value>(line).ok()?;
    string_field(&record, "cwd")
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value[key]
        .as_str()
        .filter(|text| !text.is_empty())
        .map(str::to_string)
}

fn text_blocks(content: &Value) -> Option<String> {
    let blocks = content.as_array()?;
    let text = blocks
        .iter()
        .filter(|block| block["type"] == "text")
        .filter_map(|block| block["text"].as_str())
        .collect::<Vec<_>>()
        .join(" ");
    (!text.trim().is_empty()).then_some(text)
}
