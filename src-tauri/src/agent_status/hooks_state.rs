//! Whether the installed hooks match what this version would install, so the settings page can
//! ask for Install/Repair after an update instead of silently missing features. The check builds
//! the hooks Install/Repair would write and compares, so it follows any future hook change.

use std::path::Path;

use serde::Serialize;
use serde_json::Value;

use super::claude_hooks::{claude_code_installed_entries, ApprovalHook};
use super::codex_hooks::build_codex_hook_block;
use super::{normalize_windows_line_endings, FOCUSD_AGENT_HOOK_SIGNATURE};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) enum HookInstallState {
    /// No FocuSD hook in this agent's config.
    NotInstalled,
    /// FocuSD hooks from an older version: Install/Repair would change them.
    Outdated,
    Current,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentHooksState {
    pub(super) codex: HookInstallState,
    pub(super) claude_code: HookInstallState,
    /// The hook scripts in the app data folder differ from the ones in this build.
    pub(super) scripts_outdated: bool,
}

/// Claude Code `settings.json`: current when every hook Install/Repair writes is there as is,
/// including the approval hook with the endpoint's present address (`approval`).
pub(super) fn claude_code_hooks_state(
    settings_json: Option<&str>,
    running_script_path: &Path,
    status_script_path: &Path,
    approval: Option<&ApprovalHook>,
) -> HookInstallState {
    let Some(config) = settings_json.and_then(|text| serde_json::from_str::<Value>(text).ok())
    else {
        return HookInstallState::NotInstalled;
    };
    let hooks = &config["hooks"];
    if !hooks.to_string().contains(FOCUSD_AGENT_HOOK_SIGNATURE) {
        return HookInstallState::NotInstalled;
    }

    let all_current = claude_code_installed_entries(running_script_path, status_script_path, approval)
        .iter()
        .all(|(event_name, expected)| {
            hooks[*event_name]
                .as_array()
                .is_some_and(|entries| entries.contains(expected))
        });
    if all_current {
        HookInstallState::Current
    } else {
        HookInstallState::Outdated
    }
}

/// Codex `config.toml`: current when it holds the managed block Install/Repair writes. That block
/// runs SessionStart in the background when Codex can (`runs_async`, codex_version.rs); while the
/// version is unknown either form counts, so a missing rollout does not ask for a repair.
pub(super) fn codex_hooks_state(
    config_toml: Option<&str>,
    running_script_path: &Path,
    status_script_path: &Path,
    runs_async: Option<bool>,
) -> HookInstallState {
    let Some(config) = config_toml else {
        return HookInstallState::NotInstalled;
    };
    let config = normalize_windows_line_endings(config);
    let holds = |async_start: bool| {
        let expected = build_codex_hook_block(running_script_path, status_script_path, async_start);
        config.contains(&normalize_windows_line_endings(&expected))
    };
    let current = match runs_async {
        Some(async_start) => holds(async_start),
        None => holds(false) || holds(true),
    };
    if current {
        HookInstallState::Current
    } else if config.contains(FOCUSD_AGENT_HOOK_SIGNATURE) {
        HookInstallState::Outdated
    } else {
        HookInstallState::NotInstalled
    }
}

/// Whether an installed script needs rewriting. A missing script only matters while some agent
/// config still points at it (`hooks_installed`).
pub(super) fn script_outdated(
    installed: Option<&str>,
    bundled: &str,
    hooks_installed: bool,
) -> bool {
    match installed {
        Some(content) => {
            normalize_windows_line_endings(content) != normalize_windows_line_endings(bundled)
        }
        None => hooks_installed,
    }
}
