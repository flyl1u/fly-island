//! AI agent status: the snapshot shown on the island and the Codex / Claude Code hooks that write it.

mod claude_hooks;
mod codex_hooks;
mod markers;
mod snapshot;
#[cfg(test)]
mod tests;
mod title;
mod title_cache;

use serde::Serialize;
use std::{fs, path::Path};
use tauri::{AppHandle, Manager};

use crate::system::windows_home_dir;

use claude_hooks::install_claude_code_status_hooks;
use codex_hooks::install_codex_status_hooks;
use markers::{
    apply_agent_running_markers, remove_agent_marker_files, CLAUDE_CODE_HOOK_INPUT_FILE_NAME,
    CLAUDE_CODE_RUNNING_HOLD_FILE_NAME, CLAUDE_CODE_RUNNING_MARKER_FILE_NAME,
    CODEX_HOOK_INPUT_FILE_NAME, CODEX_RUNNING_HOLD_FILE_NAME, CODEX_RUNNING_MARKER_FILE_NAME,
};
use snapshot::{
    agent_status_snapshot_from_persisted, current_unix_millis, default_agent_phase,
    default_agent_status_snapshot, default_persisted_agent_status, AgentStatusSnapshot,
    AgentTaskStatus, PersistedAgentStatus,
};
use title_cache::apply_session_titles;

pub(super) const AGENT_STATUS_FILE_NAME: &str = "agent-status.json";

pub(super) const AGENT_RUNNING_SCRIPT_FILE_NAME: &str = "focusd-agent-running.cmd";
pub(super) const AGENT_STATUS_SCRIPT_FILE_NAME: &str = "focusd-agent-status.ps1";

pub(super) const FOCUSD_AGENT_HOOK_SIGNATURE: &str = "focusd-agent-";
/// Second argument of the running script: also save the hook input (see focusd-agent-running.cmd).
pub(super) const AGENT_RUNNING_CAPTURE_ARG: &str = "capture";
pub(super) const AGENT_RUNNING_SCRIPT: &str =
    include_str!("../../../scripts/focusd-agent-running.cmd");
pub(super) const AGENT_STATUS_SCRIPT: &str =
    include_str!("../../../scripts/focusd-agent-status.ps1");

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentHooksInstallResult {
    pub(super) scripts_dir: String,
    pub(super) status_path: String,
    pub(super) codex_config_path: String,
    pub(super) claude_config_path: String,
    pub(super) installed_at: i64,
}

#[tauri::command]
pub async fn get_agent_status(app: AppHandle) -> Result<AgentStatusSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || read_agent_status(app))
        .await
        .map_err(|error| format!("Failed to join the agent status task: {error}"))?
}

fn read_agent_status(app: AppHandle) -> Result<AgentStatusSnapshot, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    fs::create_dir_all(&app_dir)
        .map_err(|error| format!("Failed to create app data directory: {error}"))?;

    let status_path = app_dir.join(AGENT_STATUS_FILE_NAME);
    let status_path_display = status_path.to_string_lossy().to_string();
    let mut snapshot = match fs::read_to_string(&status_path) {
        Ok(content) => match serde_json::from_str::<PersistedAgentStatus>(&content) {
            Ok(persisted) => agent_status_snapshot_from_persisted(persisted, status_path_display),
            Err(_) => default_agent_status_snapshot(status_path_display),
        },
        Err(_) => default_agent_status_snapshot(status_path_display),
    };
    apply_agent_running_markers(&app_dir, &mut snapshot);
    apply_session_titles(&app_dir, &mut snapshot);

    Ok(snapshot)
}

#[tauri::command]
pub fn clear_agent_status(app: AppHandle, provider: String) -> Result<AgentStatusSnapshot, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    fs::create_dir_all(&app_dir)
        .map_err(|error| format!("Failed to create app data directory: {error}"))?;

    let status_path = app_dir.join(AGENT_STATUS_FILE_NAME);
    let status_path_display = status_path.to_string_lossy().to_string();
    let mut persisted = match fs::read_to_string(&status_path) {
        Ok(content) => serde_json::from_str::<PersistedAgentStatus>(&content)
            .unwrap_or_else(|_| default_persisted_agent_status()),
        Err(_) => default_persisted_agent_status(),
    };

    let now = current_unix_millis();
    let cleared_status = AgentTaskStatus {
        phase: default_agent_phase(),
        task_id: None,
        updated_at: now,
        title: None,
    };

    match provider.as_str() {
        "codex" => {
            persisted.codex = cleared_status;
            remove_agent_marker_files(
                &app_dir,
                CODEX_RUNNING_MARKER_FILE_NAME,
                CODEX_RUNNING_HOLD_FILE_NAME,
                CODEX_HOOK_INPUT_FILE_NAME,
            );
        }
        "claudeCode" => {
            persisted.claude_code = cleared_status;
            remove_agent_marker_files(
                &app_dir,
                CLAUDE_CODE_RUNNING_MARKER_FILE_NAME,
                CLAUDE_CODE_RUNNING_HOLD_FILE_NAME,
                CLAUDE_CODE_HOOK_INPUT_FILE_NAME,
            );
        }
        _ => {
            return Err("Unsupported agent provider.".to_string());
        }
    }

    persisted.updated_at = now;
    let content = serde_json::to_string_pretty(&persisted)
        .map_err(|error| format!("Failed to serialize agent status: {error}"))?;
    write_text_file(&status_path, &content)?;

    Ok(agent_status_snapshot_from_persisted(
        persisted,
        status_path_display,
    ))
}

#[tauri::command]
pub fn install_agent_status_hooks(app: AppHandle) -> Result<AgentHooksInstallResult, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    fs::create_dir_all(&app_dir)
        .map_err(|error| format!("Failed to create app data directory: {error}"))?;

    install_agent_hook_scripts(&app_dir)?;

    let running_script_path = app_dir.join(AGENT_RUNNING_SCRIPT_FILE_NAME);
    let status_script_path = app_dir.join(AGENT_STATUS_SCRIPT_FILE_NAME);
    let home_dir = windows_home_dir()?;
    let codex_config_path = home_dir.join(".codex").join("config.toml");
    let claude_config_path = home_dir.join(".claude").join("settings.json");

    install_codex_status_hooks(
        &codex_config_path,
        &running_script_path,
        &status_script_path,
    )?;
    install_claude_code_status_hooks(
        &claude_config_path,
        &running_script_path,
        &status_script_path,
    )?;

    Ok(AgentHooksInstallResult {
        scripts_dir: app_dir.to_string_lossy().to_string(),
        status_path: app_dir
            .join(AGENT_STATUS_FILE_NAME)
            .to_string_lossy()
            .to_string(),
        codex_config_path: codex_config_path.to_string_lossy().to_string(),
        claude_config_path: claude_config_path.to_string_lossy().to_string(),
        installed_at: current_unix_millis(),
    })
}

pub(super) fn install_agent_hook_scripts(app_dir: &Path) -> Result<(), String> {
    write_text_file(
        &app_dir.join(AGENT_RUNNING_SCRIPT_FILE_NAME),
        &normalize_windows_line_endings(AGENT_RUNNING_SCRIPT),
    )?;
    write_text_file(
        &app_dir.join(AGENT_STATUS_SCRIPT_FILE_NAME),
        &normalize_windows_line_endings(AGENT_STATUS_SCRIPT),
    )
}

pub(super) fn write_text_file(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create {}: {error}", parent.display()))?;
    }

    let temporary_path = path.with_extension("tmp");
    fs::write(&temporary_path, content)
        .map_err(|error| format!("Failed to write {}: {error}", temporary_path.display()))?;
    fs::rename(&temporary_path, path)
        .or_else(|_| {
            fs::remove_file(path).ok();
            fs::rename(&temporary_path, path)
        })
        .map_err(|error| format!("Failed to replace {}: {error}", path.display()))
}

pub(super) fn normalize_windows_line_endings(content: &str) -> String {
    content.replace("\r\n", "\n").replace('\n', "\r\n")
}
