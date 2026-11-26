//! The recent steps Antigravity records in each conversation's transcript.

use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{Mutex, PoisonError},
    time::SystemTime,
};

use serde_json::Value;

use super::{
    local_agent_files::{directory, entry},
    reply_text::{asks_user, plain_reply},
    session_records::is_session_id,
    session_scan::read_tail,
    sessions::{parse_timestamp_ms, LAST_MESSAGE_MAX_CHARS},
    title::shorten,
    tool_call::ToolCall,
};

#[derive(Clone, Default)]
pub(super) struct Transcript {
    pub(super) prompt_at: Option<i64>,
    pub(super) prompt: Option<String>,
    pub(super) model: Option<String>,
    pub(super) effort: Option<String>,
    pub(super) reply: Option<String>,
    pub(super) reply_asks: bool,
    pub(super) tool: Option<ToolCall>,
    pub(super) context_tokens: Option<u64>,
    pub(super) finished_at: Option<i64>,
    pub(super) failed: bool,
    pub(super) waiting: bool,
}

/// What a transcript said for a prompt step, and the file's size and change time then.
type Cached = ((u64, Option<SystemTime>, Option<u64>), Transcript);
static CACHE: Mutex<BTreeMap<PathBuf, Cached>> = Mutex::new(BTreeMap::new());
/// Far more than the conversations listed at once; past it the cache starts over.
const MAX_CACHED: usize = 64;

pub(super) fn read(root: &Path, id: &str, prompt_step: Option<u64>) -> Transcript {
    if !is_session_id(id) {
        return Transcript::default();
    }
    let logs = ["brain", id, ".system_generated", "logs"]
        .into_iter()
        .try_fold(root.to_path_buf(), |parent, name| directory(&parent, name));
    let Some((path, metadata)) = logs.and_then(|logs| entry(&logs, "transcript.jsonl")) else {
        return Transcript::default();
    };
    if !metadata.is_file() {
        return Transcript::default();
    }
    let key = (metadata.len(), metadata.modified().ok(), prompt_step);
    let mut cache = CACHE.lock().unwrap_or_else(PoisonError::into_inner);
    if let Some((_, turn)) = cache.get(&path).filter(|(cached, _)| *cached == key) {
        return turn.clone();
    }
    let Some(tail) = read_tail(&path) else {
        return Transcript::default();
    };
    let turn = parse(&tail, prompt_step);
    if cache.len() >= MAX_CACHED {
        cache.clear();
    }
    cache.insert(path, (key, turn.clone()));
    turn
}

fn parse(tail: &str, prompt_step: Option<u64>) -> Transcript {
    let mut turn = Transcript::default();
    for step in tail
        .lines()
        .filter_map(|line| serde_json::from_str::<Value>(line.trim_start_matches('\u{feff}')).ok())
    {
        if prompt_step
            .zip(step["step_index"].as_u64())
            .is_some_and(|(prompt, index)| index < prompt)
        {
            continue;
        }
        let time = step["created_at"].as_str().and_then(parse_timestamp_ms);
        let content = step["content"].as_str().unwrap_or_default();
        match step["type"].as_str() {
            Some("USER_INPUT") => {
                turn = Transcript::default();
                turn.prompt_at = (step["source"] == "USER_EXPLICIT")
                    .then_some(time)
                    .flatten();
                turn.prompt = shorten(content, 80);
            }
            Some("PLANNER_RESPONSE") => {
                if turn.failed {
                    turn.reply = None;
                    turn.reply_asks = false;
                }
                if let Some(model) = step["model"].as_str().filter(|model| !model.is_empty()) {
                    let (name, effort) = model_parts(model);
                    turn.model = shorten(name, 80);
                    turn.effort = effort.map(str::to_owned);
                }
                if let Some(input) = step["input_tokens"].as_u64() {
                    turn.context_tokens = Some(
                        input
                            .saturating_add(step["cache_read_tokens"].as_u64().unwrap_or_default())
                            .saturating_add(step["output_tokens"].as_u64().unwrap_or_default()),
                    );
                }
                turn.tool = step["tool_calls"]
                    .as_array()
                    .and_then(|calls| calls.last())
                    .and_then(tool_call);
                if !content.trim().is_empty() {
                    let plain = plain_reply(content);
                    turn.reply = shorten(&plain, LAST_MESSAGE_MAX_CHARS);
                    turn.reply_asks = asks_user(&plain);
                }
                turn.failed = false;
                turn.waiting = step["status"] == "WAITING";
                let made_calls = step["tool_calls"]
                    .as_array()
                    .is_some_and(|calls| !calls.is_empty());
                turn.finished_at = (step["status"] == "DONE" && !made_calls)
                    .then_some(time)
                    .flatten();
            }
            Some("ERROR_MESSAGE") => {
                turn.failed = true;
                turn.waiting = false;
                turn.finished_at = None;
                if let Some(message) = step["error"]
                    .as_str()
                    .and_then(|error| shorten(error, LAST_MESSAGE_MAX_CHARS))
                {
                    turn.reply = Some(message);
                    turn.reply_asks = false;
                }
            }
            Some("GENERIC") if turn.tool.is_some() => turn.waiting = step["status"] == "WAITING",
            _ => {}
        }
    }
    turn
}

fn model_parts(model: &str) -> (&str, Option<&str>) {
    match model.rsplit_once('-') {
        Some((name, effort @ ("minimal" | "low" | "medium" | "high" | "xhigh" | "max"))) => {
            (name, Some(effort))
        }
        _ => (model, None),
    }
}

fn tool_call(call: &Value) -> Option<ToolCall> {
    let name = match call["name"].as_str()? {
        "ask_user_question" | "request_user_input" => "AskUserQuestion",
        name => name,
    };
    let args = &call["args"];
    let detail = ["command", "path", "file_path", "query"]
        .iter()
        .find_map(|key| args[*key].as_str().and_then(|text| shorten(text, 80)));
    Some(ToolCall {
        name: shorten(name, 80)?,
        detail,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_current_turn_and_ignores_its_earlier_reply_and_errors() {
        let tail = r#"{"step_index":1,"type":"PLANNER_RESPONSE","status":"DONE","content":"Old reply"}
{"step_index":2,"type":"USER_INPUT","source":"USER_EXPLICIT","content":"Fix the tests","created_at":"2026-11-22T12:00:00Z"}
{"step_index":3,"type":"ERROR_MESSAGE","error":"Retrying"}
{"step_index":4,"type":"PLANNER_RESPONSE","status":"DONE","model":"gemini-4-neon-medium","input_tokens":100,"cache_read_tokens":300,"output_tokens":20,"tool_calls":[{"name":"run_command","args":{"command":"pnpm test"}}]}"#;
        let turn = parse(tail, Some(2));
        assert_eq!(turn.prompt.as_deref(), Some("Fix the tests"));
        assert_eq!(turn.prompt_at, parse_timestamp_ms("2026-11-22T12:00:00Z"));
        assert_eq!(turn.model.as_deref(), Some("gemini-4-neon"));
        assert_eq!(turn.effort.as_deref(), Some("medium"));
        assert_eq!(turn.context_tokens, Some(420));
        assert_eq!(
            turn.tool.and_then(|tool| tool.detail).as_deref(),
            Some("pnpm test")
        );
        assert_eq!(turn.reply.as_deref(), None);
        assert_eq!(turn.finished_at, None);
        assert!(!turn.failed);
    }

    #[test]
    fn records_the_final_reply_and_its_stable_completion_time() {
        let turn = parse(
            r#"{"type":"PLANNER_RESPONSE","status":"DONE","created_at":"2026-11-22T12:00:01Z","content":"**Fixed.** Want a rerun?"}
{"type":"SYSTEM_MESSAGE","created_at":"2026-11-22T12:00:02Z"}"#,
            None,
        );
        assert_eq!(turn.reply.as_deref(), Some("Fixed. Want a rerun?"));
        assert!(turn.reply_asks);
        assert_eq!(turn.finished_at, parse_timestamp_ms("2026-11-22T12:00:01Z"));

        let turn = parse(
            r#"{"type":"ERROR_MESSAGE","status":"DONE","error":"Connection lost"}"#,
            None,
        );
        assert!(turn.failed);
        assert_eq!(turn.reply.as_deref(), Some("Connection lost"));
    }
}
