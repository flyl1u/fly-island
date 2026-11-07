//! Agent sessions for the island's Agent page, read straight from the Claude Code and Codex
//! session files, so every recent session shows up whether or not it ran with FocuSD's hooks.
//! Pure parsing only; reading and caching the files is in session_scan.rs. Both formats are
//! undocumented, so anything unexpected is skipped rather than reported.

use std::collections::HashSet;

use serde::Serialize;
use serde_json::Value;

use super::session_host::SessionHost;
use super::session_mode::{claude_permission_mode, claude_subagent_calls, claude_tool_results, codex_permission_mode};
use super::reply_marker::split_reply;
use super::background_tasks::{ended_tasks, started_tasks};
use super::reply_text::{asks_user, plain_reply};
use super::title::{display_title, prompt_title, shorten, user_prompt_in_record};
use super::tool_call::{claude_tool_call, codex_tool_call, ToolCall};

/// The latest reply shown under each session: two lines on the Agent page, up to three on an
/// alert's card (about 36 CJK or 70 Latin characters a line).
pub(super) const LAST_MESSAGE_MAX_CHARS: usize = 200;

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
    /// What the last reply's marker line says ("yourTurn", "background" or "done"), when the
    /// optional reply status marker is on (reply_marker.rs); Claude Code only.
    pub(super) reply_marker: Option<&'static str>,
    /// Whether the last reply ends by asking the user something (reply_text.rs); how a finished
    /// turn without a marker tells "your turn" from "done".
    pub(super) reply_asks: bool,
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
    /// "default", "auto", "bypass", "acceptEdits" or "plan" (session_mode.rs); `None` when unknown.
    pub(super) permission_mode: Option<&'static str>,
    /// Subagents the current turn started that have not answered yet (Claude Code only).
    pub(super) subagents: u32,
    /// Background tasks the newest turn started that have not ended (background_tasks.rs; Claude
    /// Code only). A finished turn with one running goes on by itself when it ends.
    pub(super) background_tasks: u32,
    /// Compacting its context now (PreCompact seen, PostCompact not yet; notifications.rs).
    pub(super) compacting: bool,
}

/// Where the newest turn of a session stands, before the age of the file is considered.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub(super) enum TurnState {
    #[default]
    Unknown,
    Working,
    /// Working, but the turn's last call is a tool that waits for the user (a question, or a
    /// plan to approve): the session waits on the user even without the hooks saying so.
    AwaitingUser,
    Done,
    Failed,
}

/// Claude Code tools that stop the turn until the user answers.
const USER_BLOCKING_TOOLS: [&str; 2] = ["AskUserQuestion", "ExitPlanMode"];

/// What the end of a session file says. `None` fields were not found in the excerpt.
#[derive(Debug, Default, PartialEq, Eq)]
pub(super) struct SessionTail {
    pub(super) session_id: Option<String>,
    pub(super) cwd: Option<String>,
    pub(super) title: Option<String>,
    pub(super) model: Option<String>,
    pub(super) effort: Option<String>,
    pub(super) last_message: Option<String>,
    /// The last reply's marker (reply_marker.rs), already cut from `last_message`.
    pub(super) reply_marker: Option<&'static str>,
    pub(super) reply_asks: bool,
    pub(super) state: TurnState,
    /// Timestamp of the newest prompt, Unix milliseconds.
    pub(super) turn_started_at: Option<i64>,
    pub(super) last_prompt: Option<String>,
    /// The newest tool call after the newest prompt, while the turn is still working.
    pub(super) current_tool: Option<ToolCall>,
    pub(super) permission_mode: Option<&'static str>,
    /// Subagents started after the newest prompt with no result yet, while the turn is working.
    pub(super) subagents: u32,
    /// Background tasks started after the newest prompt that have not ended, however the turn ended.
    pub(super) background_tasks: u32,
}

impl SessionTail {
    /// A finished turn has no current tool.
    fn settle(mut self) -> Self {
        if !matches!(self.state, TurnState::Working | TurnState::AwaitingUser) {
            self.current_tool = None;
            self.subagents = 0;
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
        // Waiting on the user is not a stall, however long it takes.
        TurnState::AwaitingUser => "waiting",
        TurnState::Done | TurnState::Unknown => "completed",
    }
}

/// Reads a Claude Code transcript excerpt from its end.
pub(super) fn parse_claude_tail(tail: &str) -> SessionTail {
    let mut result = SessionTail::default();
    // Read from the end, so a subagent's result comes before the call that started it.
    let mut answered = HashSet::new();
    // Background tasks seen ending; read from the end, so before the calls that started them.
    let mut ended: HashSet<String> = HashSet::new();
    for (line, record) in tail
        .lines()
        .rev()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok().map(|record| (line, record)))
    {
        ended.extend(ended_tasks(line).into_iter().map(str::to_string));
        let kind = record["type"].as_str().unwrap_or_default();
        if result.permission_mode.is_none() {
            result.permission_mode = record["permissionMode"].as_str().map(claude_permission_mode);
        }
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
                if let Some(text) = text_blocks(&message["content"]) {
                    let (marker, reply) = split_reply(&text);
                    let plain = plain_reply(reply);
                    result.reply_marker = marker.map(|marker| marker.name());
                    result.reply_asks = asks_user(&plain);
                    result.last_message = shorten(&plain, LAST_MESSAGE_MAX_CHARS);
                }
            }
            // Only tools called after the newest prompt belong to the current turn.
            if result.current_tool.is_none() && result.last_prompt.is_none() {
                result.current_tool = claude_tool_call(&message["content"]);
            }
            if result.last_prompt.is_none() {
                let running = claude_subagent_calls(&message["content"]).filter(|id| !answered.contains(*id)).count();
                result.subagents += u32::try_from(running).unwrap_or(0);
            }
        }
        if kind == "user" && result.last_prompt.is_none() {
            answered.extend(claude_tool_results(&message["content"]).map(str::to_string));
            let running = started_tasks(&message["content"]).into_iter().filter(|id| !ended.contains(id)).count();
            result.background_tasks += u32::try_from(running).unwrap_or(0);
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
            // The newest record: nothing answered this call yet.
            _ if calls_user_blocking_tool(&message["content"]) => TurnState::AwaitingUser,
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
            if result.permission_mode.is_none() {
                result.permission_mode = codex_permission_mode(payload);
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
            let plain = text.map(plain_reply);
            result.reply_asks = plain.as_deref().is_some_and(asks_user);
            result.last_message = plain.and_then(|plain| shorten(&plain, LAST_MESSAGE_MAX_CHARS));
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

/// `(session id, cwd)` from a Codex rollout's first line; `None` for a subagent's or Codex's own
/// internal thread. Those have rollouts of their own (their `id` is the thread, not the session
/// the hooks report), so listing them would add sessions no hook ever updates. A user's session
/// has a plain `source` ("cli", "vscode", "exec", ...) or `{"custom": ...}`.
pub(super) fn parse_codex_meta(first_line: &str) -> Option<(String, Option<String>)> {
    let record = serde_json::from_str::<Value>(first_line).ok()?;
    if record["type"] != "session_meta" {
        return None;
    }
    let payload = &record["payload"];
    let source = &payload["source"];
    if source.get("subagent").is_some() || source.get("internal").is_some() {
        return None;
    }
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

fn calls_user_blocking_tool(content: &Value) -> bool {
    content.as_array().is_some_and(|blocks| {
        blocks.iter().any(|block| {
            block["type"] == "tool_use" && block["name"].as_str().is_some_and(|name| USER_BLOCKING_TOOLS.contains(&name))
        })
    })
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
