//! Read-only WorkBuddy desktop sessions. WorkBuddy writes each conversation to
//! `~/.workbuddy/projects/<folder>/<session id>.jsonl` (Responses-style records: `message`,
//! `reasoning`, `function_call`, `function_call_result`, `ai-title`) and lists the conversations
//! it has open in `~/.workbuddy/sessions/<pid>.json`. The island reads both and writes nothing:
//! no hooks are installed, so approvals stay in WorkBuddy (docs/design/agent.md).

use std::{
    collections::{HashMap, HashSet},
    env,
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::{Mutex, PoisonError},
};

use serde_json::Value;

use super::{
    markers::AGENT_RUNNING_STALE_AFTER_MS,
    session_host::SessionHost,
    sessions::AgentSessionSummary,
    snapshot::system_time_to_unix_millis,
    title::{folder_title, prompt_title, shorten},
    tool_call::{codex_tool_call, ToolCall},
    window_focus::{self, SessionHints},
};
use crate::win32;

/// The desktop program, as `window_focus::app_name` spells it.
pub(super) const DESKTOP_APP: &str = "workbuddy";
const HOST_NAME: &str = "WorkBuddy";
/// Newest conversation logs looked at per scan.
const MAX_FILES: usize = 64;
const HEAD_BYTES: u64 = 64 * 1024;
const TAIL_BYTES: u64 = 256 * 1024;
/// A conversation just started may not be registered yet.
const REGISTRY_GRACE_MS: i64 = 30_000;
const CACHE_LIMIT: usize = 256;

/// What one conversation log says, before its age and the registry are considered.
#[derive(Debug, Clone, Default, PartialEq)]
pub(super) struct Parsed {
    pub(super) session_id: Option<String>,
    pub(super) cwd: Option<String>,
    pub(super) title: Option<String>,
    pub(super) first_prompt: Option<String>,
    pub(super) last_prompt: Option<String>,
    pub(super) last_prompt_at: Option<i64>,
    pub(super) model: Option<String>,
    pub(super) last_message: Option<String>,
    pub(super) tool: Option<ToolCall>,
    pub(super) context_tokens: Option<u64>,
    /// The turn is still going: the newest record is not a finished reply.
    pub(super) working: bool,
}

type Stamp = (u64, i64);
static CACHE: Mutex<Option<HashMap<PathBuf, (Stamp, Parsed)>>> = Mutex::new(None);

/// WorkBuddy's data folder: `WORKBUDDY_CONFIG_DIR` when set, as WorkBuddy itself reads it.
pub(super) fn data_root(home: &Path) -> PathBuf {
    env::var_os("WORKBUDDY_CONFIG_DIR")
        .map(PathBuf::from)
        .filter(|dir| !dir.as_os_str().is_empty())
        .unwrap_or_else(|| home.join(".workbuddy"))
}

fn texts(content: &Value, kind: &str) -> Option<String> {
    let text: Vec<&str> = content
        .as_array()?
        .iter()
        .filter(|block| block["type"] == kind)
        .filter_map(|block| block["text"].as_str())
        .collect();
    (!text.is_empty()).then(|| text.join("\n"))
}

/// Reads the records of one log excerpt in file order. Lines that are not JSON (a record cut at
/// the excerpt's edge, a damaged line) are skipped.
pub(super) fn parse(text: &str) -> Parsed {
    let mut parsed = Parsed::default();
    let mut pending: Vec<(String, Value)> = Vec::new();
    for record in text.lines().filter_map(|line| serde_json::from_str::<Value>(line).ok()) {
        if parsed.session_id.is_none() {
            parsed.session_id = record["sessionId"].as_str().filter(|id| !id.is_empty()).map(str::to_string);
        }
        if let Some(cwd) = record["cwd"].as_str().filter(|cwd| !cwd.is_empty()) {
            parsed.cwd = Some(cwd.to_string());
        }
        match (record["type"].as_str().unwrap_or(""), record["role"].as_str()) {
            ("ai-title", _) => {
                if let Some(title) = record["aiTitle"].as_str().and_then(|title| shorten(title, 80)) {
                    parsed.title = Some(title);
                }
            }
            ("message", Some("user")) => {
                if let Some(prompt) = texts(&record["content"], "input_text").as_deref().and_then(prompt_title) {
                    parsed.first_prompt.get_or_insert_with(|| prompt.clone());
                    parsed.last_prompt = Some(prompt);
                    parsed.last_prompt_at = record["timestamp"].as_i64();
                }
                pending.clear();
                parsed.working = true;
            }
            ("message", Some("assistant")) => {
                let data = &record["providerData"];
                if let Some(model) = data["requestModelName"].as_str().or_else(|| data["model"].as_str()).and_then(|m| shorten(m, 40)) {
                    parsed.model = Some(model);
                }
                if let Some(tokens) = data["rawUsage"]["total_tokens"].as_u64().or_else(|| data["usage"]["totalTokens"].as_u64()) {
                    parsed.context_tokens = Some(tokens);
                }
                if let Some(reply) = texts(&record["content"], "output_text").as_deref().and_then(|text| shorten(text, 200)) {
                    parsed.last_message = Some(reply);
                }
                parsed.working = record["status"] != "completed" || !pending.is_empty();
            }
            ("function_call", _) => {
                if let Some(id) = record["callId"].as_str() {
                    pending.push((id.to_string(), record.clone()));
                }
                parsed.working = true;
            }
            ("function_call_result", _) => {
                let id = record["callId"].as_str();
                pending.retain(|(call, _)| Some(call.as_str()) != id);
                parsed.working = true;
            }
            ("reasoning", _) => parsed.working = true,
            _ => {}
        }
    }
    parsed.tool = if parsed.working { pending.last().and_then(|(_, call)| codex_tool_call(call)) } else { None };
    parsed
}

fn read_range(file: &mut File, start: u64, length: u64) -> Option<String> {
    file.seek(SeekFrom::Start(start)).ok()?;
    let mut bytes = Vec::new();
    file.take(length).read_to_end(&mut bytes).ok()?;
    Some(String::from_utf8_lossy(&bytes).into_owned())
}

/// The whole log when it is small, else its head (first prompt, early title) and its tail
/// (newest records), each cut to whole lines.
fn read_excerpt(path: &Path, length: u64) -> Option<String> {
    let mut file = File::open(path).ok()?;
    if length <= HEAD_BYTES + TAIL_BYTES {
        return read_range(&mut file, 0, length);
    }
    let head = read_range(&mut file, 0, HEAD_BYTES)?;
    let head = &head[..head.rfind('\n').map_or(0, |end| end + 1)];
    let tail = read_range(&mut file, length - TAIL_BYTES, TAIL_BYTES)?;
    let tail = tail.split_once('\n').map_or("", |(_, rest)| rest);
    Some(format!("{head}{tail}"))
}

fn parsed(path: &Path, stamp: Stamp) -> Option<Parsed> {
    let mut cache = CACHE.lock().unwrap_or_else(PoisonError::into_inner);
    let entries = cache.get_or_insert_with(HashMap::new);
    if let Some((_, parsed)) = entries.get(path).filter(|(known, _)| *known == stamp) {
        return Some(parsed.clone());
    }
    let parsed = parse(&read_excerpt(path, stamp.0)?);
    if entries.len() >= CACHE_LIMIT {
        entries.clear();
    }
    entries.insert(path.to_path_buf(), (stamp, parsed.clone()));
    Some(parsed)
}

/// Ids of the conversations WorkBuddy has open: `kind: "interactive"` entries whose process is
/// still running. Pre-started (`prewarm`) processes hold no conversation yet.
pub(super) fn open_sessions(root: &Path) -> HashSet<String> {
    fs::read_dir(root.join("sessions"))
        .into_iter()
        .flatten()
        .flatten()
        .filter(|entry| entry.path().extension().is_some_and(|extension| extension == "json"))
        .filter_map(|entry| fs::read_to_string(entry.path()).ok())
        .filter_map(|text| registry_entry(&text))
        .filter(|(_, pid)| win32::process_times::start_time(*pid).is_some())
        .map(|(id, _)| id)
        .collect()
}

pub(super) fn registry_entry(text: &str) -> Option<(String, u32)> {
    let entry: Value = serde_json::from_str(text).ok()?;
    if entry["kind"] != "interactive" {
        return None;
    }
    let id = entry["sessionId"].as_str().filter(|id| !id.is_empty())?.to_string();
    Some((id, u32::try_from(entry["pid"].as_u64()?).ok()?))
}

/// The listed row for a parsed log. `closed`: WorkBuddy no longer has the conversation open; a
/// turn that was still going then ended with it.
pub(super) fn summary(parsed: Parsed, file_id: &str, updated_at: i64, now: i64, closed: bool, exe: Option<String>) -> AgentSessionSummary {
    let phase = match (parsed.working, closed) {
        (true, false) if now.saturating_sub(updated_at) >= AGENT_RUNNING_STALE_AFTER_MS => "stale",
        (true, false) => "running",
        _ => "completed",
    };
    let title = parsed.title.or(parsed.first_prompt).or_else(|| parsed.cwd.as_deref().and_then(folder_title));
    AgentSessionSummary {
        provider: "workbuddy",
        session_id: parsed.session_id.unwrap_or_else(|| file_id.to_string()),
        cwd: parsed.cwd,
        title,
        model: parsed.model,
        effort: None,
        phase,
        last_message: parsed.last_message,
        reply_marker: None,
        reply_asks: false,
        updated_at,
        host: Some(SessionHost { name: HOST_NAME.to_string(), exe, kind: "app" }),
        turn_started_at: parsed.last_prompt_at,
        owner_prompt_at: parsed.last_prompt_at,
        last_prompt: parsed.last_prompt,
        current_tool: if phase == "completed" { None } else { parsed.tool },
        permission_mode: None,
        subagents: 0,
        background_tasks: 0,
        compacting: false,
        todos: None,
        closed,
        remote_host: None,
        context_tokens: parsed.context_tokens,
    }
}

/// Conversations whose log changed within `window_ms`, newest first.
pub(super) fn list_sessions(home: &Path, now: i64, window_ms: i64) -> Vec<AgentSessionSummary> {
    let root = data_root(home);
    let mut files: Vec<(i64, u64, PathBuf)> = Vec::new();
    for project in fs::read_dir(root.join("projects")).into_iter().flatten().flatten() {
        for entry in fs::read_dir(project.path()).into_iter().flatten().flatten() {
            let path = entry.path();
            if path.extension().is_none_or(|extension| extension != "jsonl") {
                continue;
            }
            let Some(metadata) = entry.metadata().ok().filter(|metadata| metadata.is_file()) else { continue };
            let Some(modified) = metadata.modified().ok().and_then(system_time_to_unix_millis) else { continue };
            if now.saturating_sub(modified) <= window_ms {
                files.push((modified, metadata.len(), path));
            }
        }
    }
    if files.is_empty() {
        return Vec::new();
    }
    files.sort_by_key(|(modified, _, _)| std::cmp::Reverse(*modified));
    let open = open_sessions(&root);
    let exe = window_focus::open_app_exe(DESKTOP_APP);
    let mut seen = HashSet::new();
    files
        .into_iter()
        .take(MAX_FILES)
        .filter_map(|(modified, length, path)| {
            let file_id = path.file_stem()?.to_str()?.to_string();
            let parsed = parsed(&path, (length, modified))?;
            let id = parsed.session_id.clone().unwrap_or_else(|| file_id.clone());
            let closed = !open.contains(&id) && now.saturating_sub(modified) > REGISTRY_GRACE_MS;
            Some(summary(parsed, &file_id, modified, now, closed, exe.clone()))
        })
        .filter(|session| seen.insert(session.session_id.clone()))
        .collect()
}

/// Brings WorkBuddy's main window forward. WorkBuddy offers no outside route to one
/// conversation, so the window shows whichever it last had open.
pub(super) fn focus_desktop() -> bool {
    window_focus::focus_session_window(&SessionHints::default(), &[], Some(DESKTOP_APP)).is_some()
}

#[cfg(test)]
#[path = "workbuddy_sessions_tests.rs"]
mod tests;
