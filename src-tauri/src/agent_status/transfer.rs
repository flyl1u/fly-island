//! Only island-owned integration switches, never external agent configs or tokens.
use serde::{Deserialize, Serialize};
use tauri::Manager;
use super::{hooks_state::HookInstallState, *};

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct AgentTransfer { codex: bool, claude_code: bool, reply_marker: bool }

pub(crate) async fn export(app: &AppHandle) -> Result<AgentTransfer, String> {
    let hooks = get_agent_hooks_state(app.clone()).await?;
    let marker = reply_marker::get_reply_marker_state().await?;
    Ok(AgentTransfer { codex: hooks.codex != HookInstallState::NotInstalled,
        claude_code: hooks.claude_code != HookInstallState::NotInstalled, reply_marker: marker.installed })
}

impl AgentTransfer {
    /// Uses the new machine's paths and freshly generated approval endpoint, after setup.
    pub(crate) fn restore(&self, app: &AppHandle) -> Vec<String> {
        let restore = || -> Result<(), String> {
            let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
            let home = crate::system::windows_home_dir()?;
            if self.codex || self.claude_code { install_agent_hook_scripts(&root)?; }
            let running = root.join(AGENT_RUNNING_SCRIPT_FILE_NAME);
            let status = root.join(AGENT_STATUS_SCRIPT_FILE_NAME);
            let codex = home.join(".codex/config.toml");
            let claude = home.join(".claude/settings.json");
            if self.codex {
                install_codex_status_hooks(&codex, &running, &status, codex_version::codex_runs_async_hooks(&home) == Some(true))?;
            } else { uninstall::remove_codex_hooks(&codex)?; }
            if self.claude_code {
                install_claude_code_status_hooks(&claude, &running, &status, approval_hook().as_ref())?;
            } else { uninstall::remove_claude_code_hooks(&claude)?; }
            reply_marker::apply(self.reply_marker)?;
            Ok(())
        };
        restore().err().into_iter().collect()
    }
}
