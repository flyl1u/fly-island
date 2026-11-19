//! Kimi Code CLI sessions, read from the event log it keeps per session
//! (`~/.kimi/sessions/<folder hash>/<session id>/wire.jsonl`, or under `KIMI_SHARE_DIR`). Each
//! line is `{"timestamp": seconds, "message": {"type": ..., "payload": {...}}}`: a turn runs from
//! `TurnBegin` to `TurnEnd`, and an `ApprovalRequest` or `QuestionRequest` without its response
//! waits on the user. Unknown lines are skipped.

use std::{collections::{HashMap, HashSet}, env, fs::{self, File}, io::{Read, Seek, SeekFrom}, path::{Path, PathBuf}};

use serde_json::Value;

use super::{markers::AGENT_RUNNING_STALE_AFTER_MS, session_host::SessionHost, sessions::AgentSessionSummary,
    snapshot::system_time_to_unix_millis, title::{folder_title, shorten}};

const TAIL_BYTES: u64 = 256 * 1024;
const HEAD_BYTES: u64 = 64 * 1024;
const MAX_SESSIONS: usize = 12;

fn share_dir(home: &Path) -> PathBuf {
    env::var_os("KIMI_SHARE_DIR").map(PathBuf::from).unwrap_or_else(|| home.join(".kimi"))
}

fn read_range(path: &Path, from_end: bool, limit: u64) -> Option<String> {
    let mut file = File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    let start = if from_end { len.saturating_sub(limit) } else { 0 };
    file.seek(SeekFrom::Start(start)).ok()?;
    let mut bytes = Vec::new();
    file.take(limit).read_to_end(&mut bytes).ok()?;
    if start > 0 {
        let newline = bytes.iter().position(|&byte| byte == b'\n')?;
        bytes.drain(..=newline);
    }
    Some(String::from_utf8_lossy(&bytes).into_owned())
}

/// A prompt is text or a list of content parts; only the text parts are kept.
fn user_text(input: &Value) -> Option<String> {
    let text = match input {
        Value::String(text) => text.clone(),
        Value::Array(parts) => parts.iter().filter_map(|part| part["text"].as_str()).collect::<Vec<_>>().join(" "),
        _ => return None,
    };
    shorten(text.trim(), 80)
}

#[derive(Debug, Default, PartialEq)]
struct Turn {
    in_turn: bool,
    waiting: bool,
    prompt: Option<String>,
    prompt_at: Option<i64>,
    reply: Option<String>,
    newest_at: Option<i64>,
    context_tokens: Option<u64>,
}

fn read_turn(log: &str) -> Turn {
    let mut turn = Turn::default();
    let mut pending: HashSet<String> = HashSet::new();
    let mut reply = String::new();
    for line in log.lines() {
        let Ok(record) = serde_json::from_str::<Value>(line) else { continue };
        let Some(kind) = record["message"]["type"].as_str() else { continue };
        let payload = &record["message"]["payload"];
        let at = record["timestamp"].as_f64().map(|seconds| (seconds * 1000.0) as i64);
        turn.newest_at = at.or(turn.newest_at);
        let id = |key: &str| payload[key].as_str().map(str::to_string);
        match kind {
            "TurnBegin" => {
                turn.in_turn = true;
                turn.prompt = user_text(&payload["user_input"]);
                turn.prompt_at = at;
                turn.reply = None;
                reply.clear();
                pending.clear();
            }
            "TurnEnd" | "StepInterrupted" => { turn.in_turn = false; pending.clear(); }
            // Each step's text replaces the last: the final step's is the answer.
            "StepBegin" => reply.clear(),
            "TextPart" => reply.push_str(payload["text"].as_str().unwrap_or_default()),
            "ApprovalRequest" | "QuestionRequest" => pending.extend(id("id")),
            "ApprovalResponse" | "ApprovalRequestResolved" | "QuestionResponse" => { id("request_id").map(|id| pending.remove(&id)); }
            "StatusUpdate" => turn.context_tokens = payload["context_tokens"].as_u64().or(turn.context_tokens),
            _ => {}
        }
        if !reply.trim().is_empty() {
            turn.reply = shorten(reply.trim(), 200);
        }
    }
    turn.waiting = turn.in_turn && !pending.is_empty();
    turn
}

/// The first prompt of a session names it, unless the user renamed it (`state.json`).
fn title(dir: &Path, log: &Path) -> Option<String> {
    let state: Value = fs::read_to_string(dir.join("state.json")).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or(Value::Null);
    if let Some(title) = state["custom_title"].as_str().map(str::trim).filter(|s| !s.is_empty() && *s != "Untitled") {
        return shorten(title, 80);
    }
    read_range(log, false, HEAD_BYTES)?.lines().filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .find(|record| record["message"]["type"] == "TurnBegin")
        .and_then(|record| user_text(&record["message"]["payload"]["user_input"]))
}

fn archived(dir: &Path) -> bool {
    fs::read_to_string(dir.join("state.json")).ok().and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .is_some_and(|state| state["archived"].as_bool() == Some(true))
}

/// Folders from `kimi.json`, by the session last run in each.
fn folders(share: &Path) -> HashMap<String, String> {
    let config: Value = fs::read_to_string(share.join("kimi.json")).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or(Value::Null);
    config["work_dirs"].as_array().into_iter().flatten().filter_map(|dir| {
        Some((dir["last_session_id"].as_str()?.to_string(), dir["path"].as_str()?.to_string()))
    }).collect()
}

fn summary(id: String, turn: Turn, modified: i64, title: Option<String>, cwd: Option<String>, now: i64) -> AgentSessionSummary {
    let updated_at = modified.max(turn.newest_at.unwrap_or(0));
    let phase = match (turn.in_turn, turn.waiting) {
        (true, true) => "waiting",
        (true, false) if now.saturating_sub(updated_at) > AGENT_RUNNING_STALE_AFTER_MS => "stale",
        (true, false) => "running",
        _ => "completed",
    };
    AgentSessionSummary {
        title: title.or_else(|| turn.prompt.clone()).or_else(|| cwd.as_deref().and_then(folder_title)),
        host: Some(SessionHost { name: "Kimi Code".to_string(), exe: None, kind: "terminal" }),
        turn_started_at: turn.prompt_at,
        owner_prompt_at: turn.prompt_at,
        last_prompt: turn.prompt,
        last_message: turn.reply,
        context_tokens: turn.context_tokens,
        cwd, phase, updated_at,
        ..AgentSessionSummary::blank("kimiCode", id)
    }
}

pub(super) fn list_sessions(home: &Path, now: i64, window_ms: i64) -> Vec<AgentSessionSummary> {
    let share = share_dir(home);
    let mut logs: Vec<(i64, PathBuf)> = fs::read_dir(share.join("sessions")).into_iter().flatten().flatten()
        .flat_map(|folder| fs::read_dir(folder.path()).into_iter().flatten().flatten())
        .filter_map(|session| {
            let log = session.path().join("wire.jsonl");
            let modified = fs::metadata(&log).ok()?.modified().ok().and_then(system_time_to_unix_millis)?;
            (now.saturating_sub(modified) <= window_ms).then_some((modified, session.path()))
        }).collect();
    logs.sort_by_key(|(modified, _)| std::cmp::Reverse(*modified));
    let folders = if logs.is_empty() { HashMap::new() } else { folders(&share) };
    logs.into_iter().filter(|(_, dir)| !archived(dir)).take(MAX_SESSIONS).filter_map(|(modified, dir)| {
        let id = dir.file_name()?.to_str()?.to_string();
        let log = dir.join("wire.jsonl");
        let turn = read_turn(&read_range(&log, true, TAIL_BYTES)?);
        Some(summary(id.clone(), turn, modified, title(&dir, &log), folders.get(&id).cloned(), now))
    }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(at: f64, kind: &str, payload: &str) -> String {
        format!(r#"{{"timestamp": {at}, "message": {{"type": "{kind}", "payload": {payload}}}}}"#)
    }

    #[test]
    fn a_turn_runs_until_it_ends() {
        let log = [
            r#"{"type": "metadata", "protocol_version": "1.4"}"#.to_string(),
            line(10.0, "TurnBegin", r#"{"user_input": "fix the tests"}"#),
            line(11.0, "StepBegin", r#"{"n": 1}"#),
            line(11.5, "TextPart", r#"{"type": "text", "text": "Looking"}"#),
            line(12.0, "StepBegin", r#"{"n": 2}"#),
            line(12.5, "TextPart", r#"{"type": "text", "text": "All "}"#),
            line(12.6, "TextPart", r#"{"type": "text", "text": "green."}"#),
            line(12.7, "StatusUpdate", r#"{"context_tokens": 5120}"#),
        ].join("\n");
        let running = read_turn(&log);
        assert!(running.in_turn && !running.waiting);
        assert_eq!(running.prompt.as_deref(), Some("fix the tests"));
        assert_eq!(running.prompt_at, Some(10_000));
        assert_eq!(running.reply.as_deref(), Some("All green."));
        assert_eq!(running.context_tokens, Some(5120));
        let done = read_turn(&format!("{log}\n{}", line(13.0, "TurnEnd", "{}")));
        assert!(!done.in_turn);
        assert_eq!(summary("s".into(), done, 0, None, None, 20_000).phase, "completed");
    }

    #[test]
    fn an_open_approval_waits_on_the_user() {
        let ask = [
            line(1.0, "TurnBegin", r#"{"user_input": [{"type": "text", "text": "deploy"}]}"#),
            line(2.0, "ApprovalRequest", r#"{"id": "a1", "tool_call_id": "t", "sender": "Shell", "action": "run", "description": "x"}"#),
        ].join("\n");
        let turn = read_turn(&ask);
        assert!(turn.waiting);
        assert_eq!(summary("s".into(), turn, 0, None, None, 3_000).phase, "waiting");
        let answered = read_turn(&format!("{ask}\n{}", line(3.0, "ApprovalResponse", r#"{"request_id": "a1", "response": "approve"}"#)));
        assert!(answered.in_turn && !answered.waiting);
    }
}
