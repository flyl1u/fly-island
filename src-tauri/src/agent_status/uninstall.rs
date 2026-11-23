//! `--remove-agent-hooks`: run by the uninstaller when "Delete the application data" is ticked
//! (src-tauri/nsis/installer-hooks.nsh), so Codex and Claude Code are not left calling hook
//! scripts that went with the app data (#80).
//!
//! Only what the island wrote comes out: its marked block in the Codex `config.toml`, its
//! entries (found by their signature) in Claude Code's `settings.json`, and the reply marker
//! rules file. Everything else in those files stays as it is; a file that cannot be read or
//! parsed is left alone.

use std::{fs, path::Path};

use serde_json::Value;

use super::{
    claude_hooks::{remove_managed_claude_code_hooks, value_contains_fly_island_hook_signature},
    codex_hooks::remove_managed_codex_hook_block,
    reply_marker, write_text_file,
};

const ARG: &str = "--remove-agent-hooks";

/// Handles the uninstaller's call and exits; returns at once for any other launch. Called
/// before the app starts, so the single-instance check never sees it.
pub(crate) fn handle_startup() {
    if !std::env::args().skip(1).any(|arg| arg == ARG) {
        return;
    }
    let code = match remove_all() {
        Ok(()) => 0,
        Err(error) => {
            eprintln!("{error}");
            1
        }
    };
    std::process::exit(code);
}

fn remove_all() -> Result<(), String> {
    let home = crate::system::windows_home_dir()?;
    crate::legacy_migration::remove_hook_files_everywhere();
    let mut errors = Vec::new();
    for result in [
        remove_codex_hooks(&home.join(".codex").join("config.toml")),
        remove_claude_code_hooks(&home.join(".claude").join("settings.json")),
        reply_marker::apply(false).map(|_| ()),
    ] {
        if let Err(error) = result {
            errors.push(error);
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("\n"))
    }
}

pub(super) fn remove_codex_hooks(path: &Path) -> Result<(), String> {
    let Ok(content) = fs::read_to_string(path) else {
        return Ok(());
    };
    let next = remove_managed_codex_hook_block(&content);
    if next == content {
        return Ok(());
    }
    let mut next = next.trim_end().to_string();
    if !next.is_empty() {
        next.push('\n');
    }
    write_text_file(path, &next)
}

pub(super) fn remove_claude_code_hooks(path: &Path) -> Result<(), String> {
    let Ok(content) = fs::read_to_string(path) else {
        return Ok(());
    };
    let Ok(mut config) = serde_json::from_str::<Value>(&content) else {
        return Ok(());
    };
    if !without_island_hooks(&mut config) {
        return Ok(());
    }
    let json = serde_json::to_string_pretty(&config)
        .map_err(|error| format!("Failed to serialize Claude Code settings.json: {error}"))?;
    write_text_file(path, &json)
}

/// Takes the island's entries out of `config["hooks"]`, dropping an event the island's entries
/// were all of, and `hooks` itself once nothing is left. Returns whether anything changed.
pub(super) fn without_island_hooks(config: &mut Value) -> bool {
    let Some(root) = config.as_object_mut() else {
        return false;
    };
    let Some(Value::Object(hooks)) = root.get_mut("hooks") else {
        return false;
    };
    let ours: Vec<String> = hooks
        .iter()
        .filter(|(_, entries)| {
            matches!(entries, Value::Array(list) if list.iter().any(value_contains_fly_island_hook_signature))
        })
        .map(|(name, _)| name.clone())
        .collect();
    if ours.is_empty() {
        return false;
    }
    for name in ours {
        let kept: Vec<Value> = match hooks.remove(&name) {
            Some(Value::Array(entries)) => entries.into_iter().filter_map(remove_managed_claude_code_hooks).collect(),
            _ => Vec::new(),
        };
        if !kept.is_empty() {
            hooks.insert(name, Value::Array(kept));
        }
    }
    if hooks.is_empty() {
        root.remove("hooks");
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn only_the_island_hooks_come_out_of_claude_settings() {
        let ours = super::super::claude_hooks::claude_code_status_hook_entry(
            Path::new("C:/Users/me/AppData/Roaming/com.flyisland.app/fly-island-agent-status.ps1"),
            "completed",
        );
        let mut config = json!({
            "model": "opus",
            "hooks": {
                "Stop": [ours.clone(), { "hooks": [{ "type": "command", "command": "my-own.sh" }] }],
                "SessionStart": [ours],
                "PreToolUse": [{ "hooks": [{ "type": "command", "command": "lint.sh" }] }]
            }
        });
        assert!(without_island_hooks(&mut config));
        assert_eq!(config["model"], "opus");
        assert!(config["hooks"].get("SessionStart").is_none());
        assert_eq!(config["hooks"]["Stop"].as_array().map(Vec::len), Some(1));
        assert_eq!(config["hooks"]["PreToolUse"].as_array().map(Vec::len), Some(1));
        assert!(!without_island_hooks(&mut config));
    }

    #[test]
    fn hooks_go_once_the_island_was_all_there_was() {
        let ours = super::super::claude_hooks::claude_code_status_hook_entry(Path::new("fly-island-agent-status.ps1"), "completed");
        let mut config = json!({ "hooks": { "Stop": [ours] } });
        assert!(without_island_hooks(&mut config));
        assert_eq!(config, json!({}));
    }
}
