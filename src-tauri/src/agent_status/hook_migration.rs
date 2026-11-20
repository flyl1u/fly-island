//! Hooks written before the rename call scripts in the former data directory, which the startup
//! migration has moved, so every hook call would fail until the user reinstalled them. At startup
//! the island rewrites them once, for each agent whose config still holds a former hook, with the
//! same install functions the settings button uses (which replace only the island's own entries).

use std::{fs, path::Path};

use tauri::{AppHandle, Manager};

use super::{
    approval_hook, codex_version, install_agent_hook_scripts, install_claude_code_status_hooks,
    install_codex_status_hooks, AGENT_RUNNING_SCRIPT_FILE_NAME, AGENT_STATUS_SCRIPT_FILE_NAME,
};
use crate::{legacy_migration, system::windows_home_dir};

/// Called from setup, after the approval endpoint has started, so the repaired Claude Code hooks
/// keep their approval entry.
pub(crate) fn repair_legacy_hooks(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        if let Err(error) = repair(&app) {
            eprintln!("failed to update agent hooks written before the rename: {error}");
        }
    });
}

fn has_legacy_hooks(path: &Path) -> bool {
    fs::read_to_string(path).is_ok_and(|text| legacy_migration::contains_legacy_hook_signature(&text))
}

fn repair(app: &AppHandle) -> Result<(), String> {
    let home_dir = windows_home_dir()?;
    let codex_config_path = home_dir.join(".codex").join("config.toml");
    let claude_config_path = home_dir.join(".claude").join("settings.json");
    let codex = has_legacy_hooks(&codex_config_path);
    let claude_code = has_legacy_hooks(&claude_config_path);
    if !codex && !claude_code {
        return Ok(());
    }
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    install_agent_hook_scripts(&app_dir)?;
    let running_script_path = app_dir.join(AGENT_RUNNING_SCRIPT_FILE_NAME);
    let status_script_path = app_dir.join(AGENT_STATUS_SCRIPT_FILE_NAME);
    if codex {
        install_codex_status_hooks(
            &codex_config_path,
            &running_script_path,
            &status_script_path,
            codex_version::codex_runs_async_hooks(&home_dir) == Some(true),
        )?;
    }
    if claude_code {
        install_claude_code_status_hooks(
            &claude_config_path,
            &running_script_path,
            &status_script_path,
            approval_hook().as_ref(),
        )?;
    }
    Ok(())
}
