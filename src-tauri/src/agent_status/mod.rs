//! AI agent status: the snapshot shown on the island and the Codex / Claude Code hooks that write it.

mod claude_hooks;
mod codex_hooks;
mod editor_terminal;
mod external;
mod hooks_state;
mod host_icon;
mod markers;
mod notifications;
mod orca;
mod focus;
mod focus_log;
mod session_host;
mod session_memory;
mod session_mode;
mod session_process;
mod session_records;
mod snapshot;
pub(crate) mod sound_packs;
#[cfg(test)]
mod tests;
mod session_scan;
mod sessions;
mod title;
mod tool_call;
mod usage;
mod window_focus;

use serde::Serialize;
use serde_json::{json, Value};
use std::{fs, path::Path};
use tauri::{AppHandle, Manager};

use crate::system::windows_home_dir;

use claude_hooks::install_claude_code_status_hooks;
use codex_hooks::install_codex_status_hooks;
use hooks_state::{
    claude_code_hooks_state, codex_hooks_state, script_outdated, AgentHooksState, HookInstallState,
};
use markers::{
    apply_agent_running_markers, remove_agent_marker_files, remove_legacy_hook_inputs,
    CLAUDE_CODE_RUNNING_HOLD_FILE_NAME, CLAUDE_CODE_RUNNING_MARKER_FILE_NAME,
    CLAUDE_CODE_SAVED_INPUT_FILE_NAMES, CODEX_RUNNING_HOLD_FILE_NAME,
    CODEX_RUNNING_MARKER_FILE_NAME, CODEX_SAVED_INPUT_FILE_NAMES,
};
use snapshot::{
    agent_status_snapshot_from_persisted, current_unix_millis, default_agent_phase,
    default_agent_status_snapshot, default_persisted_agent_status, AgentStatusSnapshot,
    AgentTaskStatus, PersistedAgentStatus,
};

pub(super) const AGENT_STATUS_FILE_NAME: &str = "agent-status.json";

pub(super) const AGENT_RUNNING_SCRIPT_FILE_NAME: &str = "focusd-agent-running.cmd";
pub(super) const AGENT_STATUS_SCRIPT_FILE_NAME: &str = "focusd-agent-status.ps1";
pub(super) const AGENT_SESSION_SCRIPT_FILE_NAME: &str = "focusd-agent-session.ps1";

pub(super) const FOCUSD_AGENT_HOOK_SIGNATURE: &str = "focusd-agent-";
/// Second argument of the running script for the Notification and PermissionRequest hooks (Claude
/// Code and Codex): save the hook input instead of marking the session as running (see
/// focusd-agent-running.cmd). Installs from before the session script also pass `session` from
/// SessionStart, which the script still handles.
pub(super) const AGENT_RUNNING_NOTIFICATION_ARG: &str = "notification";
pub(super) const AGENT_RUNNING_SCRIPT: &str =
    include_str!("hooks/focusd-agent-running.cmd");
pub(super) const AGENT_STATUS_SCRIPT: &str =
    include_str!("hooks/focusd-agent-status.ps1");
/// SessionStart / SessionEnd: records the session's process and terminal (session_records.rs).
pub(super) const AGENT_SESSION_SCRIPT: &str =
    include_str!("hooks/focusd-agent-session.ps1");

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

    Ok(snapshot)
}

#[tauri::command]
pub fn clear_agent_status(app: AppHandle, provider: String) -> Result<AgentStatusSnapshot, String> {
    if provider != "codex" && provider != "claudeCode" {
        // A plugin or local API source, named by its full id.
        return if external::clear_by_id(&provider) {
            read_agent_status(app)
        } else {
            Err("Unsupported agent provider.".to_string())
        };
    }
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
    };

    match provider.as_str() {
        "codex" => {
            persisted.codex = cleared_status;
            remove_agent_marker_files(
                &app_dir,
                CODEX_RUNNING_MARKER_FILE_NAME,
                CODEX_RUNNING_HOLD_FILE_NAME,
                CODEX_SAVED_INPUT_FILE_NAMES,
            );
        }
        "claudeCode" => {
            persisted.claude_code = cleared_status;
            remove_agent_marker_files(
                &app_dir,
                CLAUDE_CODE_RUNNING_MARKER_FILE_NAME,
                CLAUDE_CODE_RUNNING_HOLD_FILE_NAME,
                CLAUDE_CODE_SAVED_INPUT_FILE_NAMES,
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

/// `agentStatus.report` for plugins (`owner` = plugin id) and the local API
/// (`owner` = `local-api`). Errors carry an HTTP-style status.
pub(crate) fn report_external_status(owner: &str, default_name: &str, params: &Value) -> Result<Value, (u16, String)> {
    let report = external::parse_report(params).map_err(|message| (400, message))?;
    let status = external::report(owner, default_name, report).map_err(|message| (429, message))?;
    serde_json::to_value(status).map_err(|error| (500, error.to_string()))
}

/// `agentStatus.clear`: one source (`{ source }`) or all of the owner's (`{}`).
pub(crate) fn clear_external_status(owner: &str, params: &Value) -> Result<Value, (u16, String)> {
    let source = match params.get("source") {
        None | Some(Value::Null) => None,
        Some(Value::String(source)) => Some(source.as_str()),
        Some(_) => return Err((400, "\"source\" must be a string.".into())),
    };
    Ok(json!({ "cleared": external::clear(owner, source) }))
}

/// Drops every source a stopped plugin reported.
pub(crate) fn clear_external_owner(owner: &str) {
    external::clear(owner, None);
}

#[tauri::command]
pub fn install_agent_status_hooks(app: AppHandle) -> Result<AgentHooksInstallResult, String> {
    crate::dev_lane::refuse_in_preview("install the AI agents' status hooks")?;
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

/// Claude Code and Codex sessions active in the last two hours, running and waiting ones first.
#[tauri::command]
/// `window_hours` (1-24, default 2): how long ago a listed session may have last changed.
pub async fn list_agent_sessions(
    app: AppHandle,
    window_hours: Option<u32>,
) -> Result<Vec<sessions::AgentSessionSummary>, String> {
    let window_ms = window_hours
        .map(|hours| i64::from(hours.clamp(1, 24)) * 60 * 60 * 1000)
        .unwrap_or(session_scan::ACTIVE_WINDOW_MS);
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        let waiting = notifications::waiting_notifications(&app_dir);
        windows_home_dir().map(|home_dir| {
            let mut sessions = session_scan::list_sessions(&home_dir, Some(&app_dir), &waiting, window_ms);
            session_host::attach_hosts(&home_dir, Some(&app_dir), &mut sessions);
            sessions
        })
    })
    .await
    .map_err(|error| format!("Failed to join the agent sessions task: {error}"))?
}

/// Brings the editor or terminal window of an agent session to the front: the window of the
/// session's own process chain when it is running, else one matched by folder (`cwd`) and title.
/// In Orca, also switches to the session's terminal tab. Returns false when no window matched.
/// `session_id` is optional so older callers keep working.
#[tauri::command]
pub async fn focus_agent_window(
    app: AppHandle,
    provider: String,
    cwd: Option<String>,
    title: Option<String>,
    session_id: Option<String>,
) -> Result<bool, String> {
    let app_dir = app.path().app_data_dir().ok();
    tauri::async_runtime::spawn_blocking(move || {
        focus::focus_session(app_dir.as_deref(), &provider, cwd.as_deref(), title.as_deref(), session_id.as_deref())
    })
    .await
    .map_err(|error| format!("Failed to join the window focus task: {error}"))
}

/// Which of `sessions` have their window in front (focus.rs); the Agent page counts those as
/// seen. Returns their session ids.
#[tauri::command]
pub async fn agent_sessions_in_front(app: AppHandle, sessions: Vec<focus::SessionRef>) -> Result<Vec<String>, String> {
    let app_dir = app.path().app_data_dir().ok();
    tauri::async_runtime::spawn_blocking(move || focus::sessions_in_front(app_dir.as_deref(), &sessions))
        .await
        .map_err(|error| format!("Failed to join the window check: {error}"))
}

/// Claude usage limits from claude-hud's usage snapshot (usage.rs); null when there is none.
#[tauri::command]
pub async fn get_agent_usage() -> Result<Option<usage::AgentUsage>, String> {
    let home_dir = windows_home_dir()?;
    tauri::async_runtime::spawn_blocking(move || usage::read_usage(&home_dir))
        .await
        .map_err(|error| format!("Failed to join the usage task: {error}"))
}

/// The icon of a session host (`host.exe` of a listed session) as a PNG data URL; null when the
/// path is not an existing .exe or it has no icon.
#[tauri::command]
pub async fn get_agent_host_icon(path: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || host_icon::icon_data_url(&path))
        .await
        .map_err(|error| format!("Failed to join the host icon task: {error}"))
}

/// Compares the installed hooks with what Install/Repair would write. Only reads files.
#[tauri::command]
pub async fn get_agent_hooks_state(app: AppHandle) -> Result<AgentHooksState, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || read_agent_hooks_state(&app_dir))
        .await
        .map_err(|error| format!("Failed to join the agent hooks task: {error}"))?
}

fn read_agent_hooks_state(app_dir: &Path) -> Result<AgentHooksState, String> {
    let home_dir = windows_home_dir()?;
    let read = |path: &Path| fs::read_to_string(path).ok();
    // Install/Repair always points the hooks at the scripts in the app data folder.
    let running_script_path = app_dir.join(AGENT_RUNNING_SCRIPT_FILE_NAME);
    let status_script_path = app_dir.join(AGENT_STATUS_SCRIPT_FILE_NAME);
    let codex = codex_hooks_state(
        read(&home_dir.join(".codex").join("config.toml")).as_deref(),
        &running_script_path,
        &status_script_path,
    );
    let claude_code = claude_code_hooks_state(
        read(&home_dir.join(".claude").join("settings.json")).as_deref(),
        &running_script_path,
        &status_script_path,
    );
    let hooks_installed =
        codex != HookInstallState::NotInstalled || claude_code != HookInstallState::NotInstalled;
    let scripts_outdated = script_outdated(
        read(&app_dir.join(AGENT_RUNNING_SCRIPT_FILE_NAME)).as_deref(),
        AGENT_RUNNING_SCRIPT,
        hooks_installed,
    ) || script_outdated(
        read(&app_dir.join(AGENT_STATUS_SCRIPT_FILE_NAME)).as_deref(),
        AGENT_STATUS_SCRIPT,
        hooks_installed,
    ) || script_outdated(
        read(&app_dir.join(AGENT_SESSION_SCRIPT_FILE_NAME)).as_deref(),
        AGENT_SESSION_SCRIPT,
        hooks_installed,
    );

    Ok(AgentHooksState {
        codex,
        claude_code,
        scripts_outdated,
    })
}

pub(super) fn install_agent_hook_scripts(app_dir: &Path) -> Result<(), String> {
    remove_legacy_hook_inputs(app_dir);
    write_text_file(
        &app_dir.join(AGENT_RUNNING_SCRIPT_FILE_NAME),
        &normalize_windows_line_endings(AGENT_RUNNING_SCRIPT),
    )?;
    write_text_file(
        &app_dir.join(AGENT_STATUS_SCRIPT_FILE_NAME),
        &normalize_windows_line_endings(AGENT_STATUS_SCRIPT),
    )?;
    write_text_file(
        &app_dir.join(AGENT_SESSION_SCRIPT_FILE_NAME),
        &normalize_windows_line_endings(AGENT_SESSION_SCRIPT),
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

/// This module's Tauri commands. `lib.rs` chains every module's list into one
/// `generate_handler!`, so adding a command only touches this file.
macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::agent_status::get_agent_status,
            crate::agent_status::clear_agent_status,
            crate::agent_status::install_agent_status_hooks,
            crate::agent_status::get_agent_hooks_state,
            crate::agent_status::focus_agent_window,
            crate::agent_status::agent_sessions_in_front,
            crate::agent_status::get_agent_host_icon,
            crate::agent_status::list_agent_sessions,
            crate::agent_status::get_agent_usage,
            crate::agent_status::sound_packs::list_sound_packs,
            crate::agent_status::sound_packs::import_sound_pack,
            crate::agent_status::sound_packs::remove_sound_pack,
            crate::agent_status::sound_packs::read_sound_pack_file,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
