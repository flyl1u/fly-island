//! Whether the installed hooks match what this version would install, so the settings page can
//! ask for Install/Repair after an update instead of silently missing features (session titles).

use serde::Serialize;
use serde_json::Value;

use super::codex_hooks::{FOCUSD_AGENT_HOOK_BLOCK_BEGIN, FOCUSD_AGENT_HOOK_BLOCK_END};
use super::{
    normalize_windows_line_endings, AGENT_RUNNING_CAPTURE_ARG, FOCUSD_AGENT_HOOK_SIGNATURE,
};

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

/// Claude Code `settings.json`: current when a FocuSD `UserPromptSubmit` hook passes `capture`.
pub(super) fn claude_code_hooks_state(settings_json: Option<&str>) -> HookInstallState {
    let Some(config) = settings_json.and_then(|text| serde_json::from_str::<Value>(text).ok())
    else {
        return HookInstallState::NotInstalled;
    };
    let hooks = &config["hooks"];
    let has_focusd = |value: &Value| value.to_string().contains(FOCUSD_AGENT_HOOK_SIGNATURE);
    if !has_focusd(hooks) {
        return HookInstallState::NotInstalled;
    }

    let captures = hooks["UserPromptSubmit"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|entry| entry["hooks"].as_array())
        .flatten()
        .filter(|hook| has_focusd(hook))
        .any(|hook| {
            hook["args"]
                .as_array()
                .and_then(|args| args.last())
                .and_then(Value::as_str)
                == Some(AGENT_RUNNING_CAPTURE_ARG)
        });
    if captures {
        HookInstallState::Current
    } else {
        HookInstallState::Outdated
    }
}

/// Codex `config.toml`: current when the managed block's submit command passes `capture`.
pub(super) fn codex_hooks_state(config_toml: Option<&str>) -> HookInstallState {
    let Some(config) = config_toml else {
        return HookInstallState::NotInstalled;
    };
    let Some(start) = config.find(FOCUSD_AGENT_HOOK_BLOCK_BEGIN) else {
        return if config.contains(FOCUSD_AGENT_HOOK_SIGNATURE) {
            // Hooks from before the managed block existed.
            HookInstallState::Outdated
        } else {
            HookInstallState::NotInstalled
        };
    };
    let block = &config[start..];
    let block = block
        .find(FOCUSD_AGENT_HOOK_BLOCK_END)
        .map_or(block, |end| &block[..end]);
    // The installer writes `... codex capture\""` (TOML-escaped quotes).
    if block.contains(&format!("codex {AGENT_RUNNING_CAPTURE_ARG}\\\"")) {
        HookInstallState::Current
    } else {
        HookInstallState::Outdated
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
