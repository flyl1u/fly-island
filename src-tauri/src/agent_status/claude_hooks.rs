//! Managed hook entries in the Claude Code `settings.json`.

use serde_json::{json, Map, Value};
use std::{fs, path::Path};

use super::{write_text_file, AGENT_RUNNING_NOTIFICATION_ARG, FOCUSD_AGENT_HOOK_SIGNATURE};

pub(super) fn install_claude_code_status_hooks(
    config_path: &Path,
    running_script_path: &Path,
    status_script_path: &Path,
) -> Result<(), String> {
    let mut config = match fs::read_to_string(config_path) {
        Ok(content) if !content.trim().is_empty() => serde_json::from_str::<Value>(&content)
            .map_err(|error| format!("Failed to parse Claude Code settings.json: {error}"))?,
        _ => json!({}),
    };

    let Some(root) = config.as_object_mut() else {
        return Err("Claude Code settings.json must contain a JSON object.".to_string());
    };

    let hooks = root
        .entry("hooks")
        .or_insert_with(|| Value::Object(Map::new()));
    if !hooks.is_object() {
        *hooks = Value::Object(Map::new());
    }
    let hooks = hooks
        .as_object_mut()
        .ok_or_else(|| "Failed to prepare Claude Code hooks object.".to_string())?;

    for (event_name, entry) in claude_code_hook_entries(running_script_path, status_script_path) {
        install_claude_code_hook_event(hooks, event_name, entry);
    }

    let json = serde_json::to_string_pretty(&config)
        .map_err(|error| format!("Failed to serialize Claude Code settings.json: {error}"))?;
    write_text_file(config_path, &json)
}

/// Notifications that mean the session waits for the user mid-turn: a tool permission prompt or
/// an MCP server asking for input. Claude Code matches this against the notification type.
pub(super) const CLAUDE_CODE_WAITING_NOTIFICATIONS: &str = "permission_prompt|elicitation_dialog";

/// Every FocuSD hook for Claude Code, by event name.
pub(super) fn claude_code_hook_entries(
    running_script_path: &Path,
    status_script_path: &Path,
) -> Vec<(&'static str, Value)> {
    let mut notification = claude_code_running_hook_entry(running_script_path);
    if let Some(args) = notification["hooks"][0]["args"].as_array_mut() {
        args.push(Value::String(AGENT_RUNNING_NOTIFICATION_ARG.to_string()));
    }
    if let Value::Object(object) = &mut notification {
        object.insert(
            "matcher".to_string(),
            Value::String(CLAUDE_CODE_WAITING_NOTIFICATIONS.to_string()),
        );
    }

    vec![
        (
            "UserPromptSubmit",
            claude_code_running_hook_entry(running_script_path),
        ),
        (
            "PreToolUse",
            claude_code_match_all_hook_entry(claude_code_running_hook_entry(running_script_path)),
        ),
        ("Notification", notification),
        (
            "Stop",
            claude_code_status_hook_entry(status_script_path, "completed"),
        ),
        (
            "StopFailure",
            claude_code_status_hook_entry(status_script_path, "failed"),
        ),
    ]
}

pub(super) fn install_claude_code_hook_event(
    hooks: &mut Map<String, Value>,
    event_name: &str,
    entry: Value,
) {
    let mut entries = hooks
        .remove(event_name)
        .and_then(|value| match value {
            Value::Array(entries) => Some(entries),
            _ => None,
        })
        .unwrap_or_default()
        .into_iter()
        .filter_map(remove_managed_claude_code_hooks)
        .collect::<Vec<_>>();

    entries.push(entry);
    hooks.insert(event_name.to_string(), Value::Array(entries));
}

pub(super) fn remove_managed_claude_code_hooks(mut entry: Value) -> Option<Value> {
    let Value::Object(entry_object) = &mut entry else {
        return Some(entry);
    };

    let Some(hooks_value) = entry_object.get_mut("hooks") else {
        return Some(entry);
    };

    let Value::Array(hooks) = hooks_value else {
        return Some(entry);
    };

    hooks.retain(|hook| !value_contains_focusd_hook_signature(hook));
    if hooks.is_empty() {
        None
    } else {
        Some(entry)
    }
}

pub(super) fn value_contains_focusd_hook_signature(value: &Value) -> bool {
    match value {
        Value::String(text) => text.contains(FOCUSD_AGENT_HOOK_SIGNATURE),
        Value::Array(values) => values.iter().any(value_contains_focusd_hook_signature),
        Value::Object(values) => values.values().any(value_contains_focusd_hook_signature),
        _ => false,
    }
}

pub(super) fn claude_code_match_all_hook_entry(mut entry: Value) -> Value {
    if let Value::Object(object) = &mut entry {
        object.insert("matcher".to_string(), Value::String("*".to_string()));
    }

    entry
}

pub(super) fn claude_code_running_hook_entry(script_path: &Path) -> Value {
    // Claude Code spawns `args` with MSVC-style escaping, which turns embedded
    // quotes into `\"` that cmd.exe cannot parse. Pass the path as its own
    // argument and let the spawner add plain quotes only when it needs them.
    let args = vec![
        "/d".to_string(),
        "/c".to_string(),
        script_path.to_string_lossy().to_string(),
        "claudeCode".to_string(),
    ];
    claude_code_hook_entry("cmd.exe", args, 1)
}

pub(super) fn claude_code_status_hook_entry(script_path: &Path, phase: &str) -> Value {
    claude_code_hook_entry(
        "powershell.exe",
        vec![
            "-NoProfile".to_string(),
            "-ExecutionPolicy".to_string(),
            "Bypass".to_string(),
            "-File".to_string(),
            script_path.to_string_lossy().to_string(),
            "claudeCode".to_string(),
            phase.to_string(),
        ],
        5,
    )
}

pub(super) fn claude_code_hook_entry(command: &str, args: Vec<String>, timeout: i64) -> Value {
    json!({
        "hooks": [
            {
                "type": "command",
                "command": command,
                "args": args,
                "timeout": timeout
            }
        ]
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn running_hook_passes_script_path_as_unquoted_argument() {
        let path = Path::new(r"C:\Users\a b\focusd-agent-running.cmd");
        let entry = claude_code_running_hook_entry(path);
        let args = entry["hooks"][0]["args"].as_array().unwrap();

        assert_eq!(
            args,
            &vec![
                json!("/d"),
                json!("/c"),
                json!(r"C:\Users\a b\focusd-agent-running.cmd"),
                json!("claudeCode"),
            ]
        );
        assert!(args.iter().all(|arg| !arg.as_str().unwrap().contains('"')));
    }

    #[test]
    fn only_waiting_notifications_save_their_input() {
        let running = Path::new(r"C:\focusd-agent-running.cmd");
        let status = Path::new(r"C:\focusd-agent-status.ps1");
        let mut hooks = Map::new();
        for (event_name, entry) in claude_code_hook_entries(running, status) {
            install_claude_code_hook_event(&mut hooks, event_name, entry);
        }

        let last_arg = |event: &str| {
            hooks[event][0]["hooks"][0]["args"]
                .as_array()
                .unwrap()
                .last()
                .cloned()
        };
        // Prompts and tool calls only mark the session as running; nothing is saved.
        assert_eq!(last_arg("UserPromptSubmit"), Some(json!("claudeCode")));
        assert_eq!(last_arg("PreToolUse"), Some(json!("claudeCode")));
        assert_eq!(last_arg("Notification"), Some(json!("notification")));
        assert_eq!(
            hooks["Notification"][0]["matcher"],
            json!("permission_prompt|elicitation_dialog")
        );
        assert_eq!(last_arg("Stop"), Some(json!("completed")));
    }
}
