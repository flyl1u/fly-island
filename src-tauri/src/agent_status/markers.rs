//! Running markers written by the hook scripts while an agent turn is in progress.

use std::{fs, path::Path};

use super::snapshot::{
    current_unix_millis, system_time_to_unix_millis, AgentStatusSnapshot, AgentTaskStatus,
};

pub(super) const CODEX_RUNNING_MARKER_FILE_NAME: &str = "agent-codex-running.flag";
pub(super) const CODEX_RUNNING_HOLD_FILE_NAME: &str = "agent-codex-running-hold.flag";
pub(super) const CLAUDE_CODE_RUNNING_MARKER_FILE_NAME: &str = "agent-claudeCode-running.flag";
pub(super) const CLAUDE_CODE_RUNNING_HOLD_FILE_NAME: &str = "agent-claudeCode-running-hold.flag";
/// Hook stdin saved by `focusd-agent-running.cmd <provider> capture`, read for session titles.
pub(super) const CODEX_HOOK_INPUT_FILE_NAME: &str = "agent-codex-hook-input.json";
pub(super) const CLAUDE_CODE_HOOK_INPUT_FILE_NAME: &str = "agent-claudeCode-hook-input.json";

pub(super) const AGENT_RUNNING_STALE_AFTER_MS: i64 = 10 * 60 * 1000;

pub(super) fn apply_agent_running_markers(app_dir: &Path, snapshot: &mut AgentStatusSnapshot) {
    let now = current_unix_millis();

    if let Some(marker_status) = active_agent_running_marker_status(
        app_dir,
        &snapshot.codex,
        CODEX_RUNNING_MARKER_FILE_NAME,
        CODEX_RUNNING_HOLD_FILE_NAME,
        now,
    ) {
        snapshot.codex.phase = marker_status.phase;
        snapshot.codex.updated_at = marker_status.updated_at;
    }

    if let Some(marker_status) = active_agent_running_marker_status(
        app_dir,
        &snapshot.claude_code,
        CLAUDE_CODE_RUNNING_MARKER_FILE_NAME,
        CLAUDE_CODE_RUNNING_HOLD_FILE_NAME,
        now,
    ) {
        snapshot.claude_code.phase = marker_status.phase;
        snapshot.claude_code.updated_at = marker_status.updated_at;
    }
}

pub(super) fn active_agent_running_marker_status(
    app_dir: &Path,
    status: &AgentTaskStatus,
    running_file_name: &str,
    hold_file_name: &str,
    now: i64,
) -> Option<AgentTaskStatus> {
    let running_path = app_dir.join(running_file_name);
    if running_path.is_file() {
        let marker_updated_at = file_modified_unix_millis(&running_path).unwrap_or(now);
        if status.phase != "running"
            && status.updated_at > 0
            && status.updated_at >= marker_updated_at
        {
            return None;
        }

        let phase = if now.saturating_sub(marker_updated_at) >= AGENT_RUNNING_STALE_AFTER_MS {
            "stale"
        } else {
            "running"
        };

        return Some(AgentTaskStatus {
            phase: phase.to_string(),
            task_id: status.task_id.clone(),
            updated_at: marker_updated_at,
            title: None,
        });
    }

    let hold_path = app_dir.join(hold_file_name);
    let visible_until = fs::read_to_string(hold_path)
        .ok()
        .and_then(|content| content.trim().parse::<i64>().ok())?;
    if visible_until > now {
        Some(AgentTaskStatus {
            phase: "running".to_string(),
            task_id: status.task_id.clone(),
            updated_at: now,
            title: None,
        })
    } else {
        None
    }
}

/// Removes the running markers and the saved hook input, which also clears the session title.
pub(super) fn remove_agent_marker_files(
    app_dir: &Path,
    running_file_name: &str,
    hold_file_name: &str,
    hook_input_file_name: &str,
) {
    fs::remove_file(app_dir.join(running_file_name)).ok();
    fs::remove_file(app_dir.join(hold_file_name)).ok();
    fs::remove_file(app_dir.join(hook_input_file_name)).ok();
}

pub(super) fn file_modified_unix_millis(path: &Path) -> Option<i64> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    system_time_to_unix_millis(modified)
}
