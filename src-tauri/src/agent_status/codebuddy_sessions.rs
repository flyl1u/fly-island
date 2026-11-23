//! Read-only CodeBuddy CLI sessions. CodeBuddy writes each conversation to
//! `~/.codebuddy/projects/<folder>/<session id>.jsonl` in the same Responses-style format as
//! WorkBuddy (`message`, `reasoning`, `function_call`, `function_call_result`, `ai-title`) and
//! lists the conversations it has open in `~/.codebuddy/sessions/<pid>.json`. The island reads
//! both and writes nothing: no hooks are installed, so approvals stay in CodeBuddy.

use std::{
    collections::HashSet,
    env,
    fs,
    path::{Path, PathBuf},
};

use serde_json::Value;

use super::{
    markers::AGENT_RUNNING_STALE_AFTER_MS,
    session_host::SessionHost,
    session_process::ancestor_chain,
    sessions::AgentSessionSummary,
    snapshot::system_time_to_unix_millis,
    title::folder_title,
    workbuddy_sessions::{parsed, Parsed},
};
use crate::win32;

/// Shown on the Agent page as where the session runs, like WorkBuddy's own name.
const HOST_NAME: &str = "CodeBuddy";
/// Newest conversation logs looked at per scan.
const MAX_FILES: usize = 64;
/// A conversation just started may not be registered yet.
const REGISTRY_GRACE_MS: i64 = 30_000;

/// CodeBuddy's data folder: `CODEBUDDY_CONFIG_DIR` when set, as the CLI itself reads it.
pub(super) fn data_root(home: &Path) -> PathBuf {
    env::var_os("CODEBUDDY_CONFIG_DIR")
        .map(PathBuf::from)
        .filter(|dir| !dir.as_os_str().is_empty())
        .unwrap_or_else(|| home.join(".codebuddy"))
}

/// Ids of the conversations CodeBuddy has open: `kind: "interactive"` entries whose process is
/// still running. A prewarmed process holds no conversation yet.
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

/// The listed row for a parsed log. `closed`: CodeBuddy no longer has the conversation open; a
/// turn that was still going then ended with it.
pub(super) fn summary(parsed: Parsed, file_id: &str, updated_at: i64, now: i64, closed: bool) -> AgentSessionSummary {
    let phase = match (parsed.working, closed) {
        (true, false) if now.saturating_sub(updated_at) >= AGENT_RUNNING_STALE_AFTER_MS => "stale",
        (true, false) => "running",
        _ => "completed",
    };
    let title = parsed.title.or(parsed.first_prompt).or_else(|| parsed.cwd.as_deref().and_then(folder_title));
    AgentSessionSummary {
        last_completed_at: None,
        provider: "codebuddy",
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
        host: Some(SessionHost { name: HOST_NAME.to_string(), exe: None, kind: "terminal" }),
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
    let mut seen = HashSet::new();
    files
        .into_iter()
        .take(MAX_FILES)
        .filter_map(|(modified, length, path)| {
            let file_id = path.file_stem()?.to_str()?.to_string();
            let parsed = parsed(&path, (length, modified))?;
            let id = parsed.session_id.clone().unwrap_or_else(|| file_id.clone());
            let closed = !open.contains(&id) && now.saturating_sub(modified) > REGISTRY_GRACE_MS;
            Some(summary(parsed, &file_id, modified, now, closed))
        })
        .filter(|session| seen.insert(session.session_id.clone()))
        .collect()
}

/// The running conversation's process and its ancestors, so the island can bring the terminal
/// window that shows it forward. Empty when CodeBuddy no longer lists the conversation.
pub(super) fn live_process_chain(home: &Path, session_id: &str) -> Vec<u32> {
    let root = data_root(home);
    let pid = fs::read_dir(root.join("sessions"))
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| fs::read_to_string(entry.path()).ok())
        .filter_map(|text| registry_entry(&text))
        .find(|(id, _)| id == session_id)
        .map(|(_, pid)| pid);
    let Some(pid) = pid else { return Vec::new() };
    ancestor_chain(pid, &win32::process_tree::parent_process_ids(), win32::process_times::start_time)
}

#[cfg(test)]
#[path = "codebuddy_sessions_tests.rs"]
mod tests;
