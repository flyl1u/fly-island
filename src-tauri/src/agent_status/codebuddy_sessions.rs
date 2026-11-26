//! Read-only CodeBuddy CLI sessions. CodeBuddy writes each conversation to
//! `~/.codebuddy/projects/<folder>/<session id>.jsonl` in the same Responses-style format as
//! WorkBuddy (`message`, `reasoning`, `function_call`, `function_call_result`, `ai-title`) and
//! lists the conversations it has open in `~/.codebuddy/sessions/<pid>.json`. The island reads
//! both and writes nothing: no hooks are installed, so approvals stay in CodeBuddy.

use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

use super::{
    codebuddy_registry::open_sessions,
    local_agent_files::{directory, entry},
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
    let Some(root) = directory(home, ".codebuddy") else { return Vec::new() };
    let Some(projects) = directory(&root, "projects") else { return Vec::new() };
    let mut files: Vec<(i64, u64, PathBuf)> = Vec::new();
    for project in fs::read_dir(&projects).into_iter().flatten().flatten() {
        let Some(project) = directory(&projects, project.file_name()) else { continue };
        for item in fs::read_dir(&project).into_iter().flatten().flatten() {
            let name = item.file_name();
            if Path::new(&name).extension().is_none_or(|extension| extension != "jsonl") {
                continue;
            }
            let Some((path, metadata)) = entry(&project, name).filter(|(_, metadata)| metadata.is_file()) else { continue };
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
            let closed = !open.contains_key(&id) && now.saturating_sub(modified) > REGISTRY_GRACE_MS;
            Some(summary(parsed, &file_id, modified, now, closed))
        })
        .filter(|session| seen.insert(session.session_id.clone()))
        .collect()
}

/// The running conversation's process and its ancestors, so the island can bring the terminal
/// window that shows it forward. Empty when CodeBuddy no longer lists the conversation.
pub(super) fn live_process_chain(home: &Path, session_id: &str) -> Vec<u32> {
    let pid = directory(home, ".codebuddy").and_then(|root| open_sessions(&root).get(session_id).copied());
    let Some(pid) = pid else { return Vec::new() };
    ancestor_chain(pid, &win32::process_tree::parent_process_ids(), win32::process_times::start_time)
}

#[cfg(test)]
#[path = "codebuddy_sessions_tests.rs"]
mod tests;
