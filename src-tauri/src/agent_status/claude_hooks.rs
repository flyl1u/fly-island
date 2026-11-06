//! Managed hook entries in the Claude Code `settings.json`.

use serde_json::{json, Map, Value};
use std::{fs, path::Path};

use super::{
    write_text_file, AGENT_RUNNING_NOTIFICATION_ARG, AGENT_SESSION_SCRIPT_FILE_NAME,
    FOCUSD_AGENT_HOOK_SIGNATURE,
};

/// Where the approval hook posts (`agent_approval`), and the token it shows.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ApprovalHook {
    pub url: String,
    /// Where the AskUserQuestion hook posts (roadmap B6 phase 3); None installs no question hook.
    pub question_url: Option<String>,
    pub token: String,
}

/// The island waits up to 120 s for the user (`agent_approval::WAIT_LIMIT`); the hook waits
/// longer, so the island hands the request back before Claude Code gives up on it.
pub(super) const APPROVAL_HOOK_TIMEOUT_SECONDS: i64 = 150;

/// Marks the approval hook as FocuSD's: an HTTP hook has no script path to carry the signature.
const APPROVAL_HOOK_MARKER_HEADER: &str = "X-FocuSD-Hook";

pub(super) fn install_claude_code_status_hooks(
    config_path: &Path,
    running_script_path: &Path,
    status_script_path: &Path,
    approval: Option<&ApprovalHook>,
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

    install_claude_code_hook_events(
        hooks,
        claude_code_installed_entries(running_script_path, status_script_path, approval),
    );

    let json = serde_json::to_string_pretty(&config)
        .map_err(|error| format!("Failed to serialize Claude Code settings.json: {error}"))?;
    write_text_file(config_path, &json)
}

/// Notifications that mean the session waits for the user mid-turn: a tool permission prompt, an
/// MCP server asking for input, or an agent needing input. Matched against the notification type.
pub(super) const CLAUDE_CODE_WAITING_NOTIFICATIONS: &str =
    "permission_prompt|elicitation_dialog|agent_needs_input";

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

    // PermissionRequest fires before every permission prompt: the surest sign the session waits.
    let mut permission = claude_code_running_hook_entry(running_script_path);
    if let Some(args) = permission["hooks"][0]["args"].as_array_mut() {
        args.push(Value::String(AGENT_RUNNING_NOTIFICATION_ARG.to_string()));
    }

    let session_script_path = status_script_path.with_file_name(AGENT_SESSION_SCRIPT_FILE_NAME);
    // In the background: looking up the session's process takes about a second.
    let mut session_start = claude_code_session_hook_entry(&session_script_path, "start");
    if let Some(hook) = session_start["hooks"][0].as_object_mut() {
        hook.insert("async".to_string(), Value::Bool(true));
    }

    vec![
        ("SessionStart", session_start),
        ("SessionEnd", claude_code_session_hook_entry(&session_script_path, "end")),
        ("PermissionRequest", permission),
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

/// What Install/Repair writes: the status hooks, and the approval hooks when the island's endpoint
/// runs. They sit beside the status hooks of the same events (`PermissionRequest`, `PreToolUse`)
/// as separate entries; Claude Code runs them side by side.
pub(super) fn claude_code_installed_entries(
    running_script_path: &Path,
    status_script_path: &Path,
    approval: Option<&ApprovalHook>,
) -> Vec<(&'static str, Value)> {
    let mut entries = claude_code_hook_entries(running_script_path, status_script_path);
    if let Some(approval) = approval {
        entries.push(("PermissionRequest", claude_code_http_hook_entry(&approval.url, &approval.token, "approval")));
        if let Some(question_url) = &approval.question_url {
            let mut question = claude_code_http_hook_entry(question_url, &approval.token, "question");
            if let Value::Object(object) = &mut question {
                object.insert("matcher".to_string(), Value::String("AskUserQuestion".to_string()));
            }
            entries.push(("PreToolUse", question));
        }
    }
    entries
}

/// An HTTP hook that holds a request for the island's card (roadmap B6 phases 2 and 3).
fn claude_code_http_hook_entry(url: &str, token: &str, marker: &str) -> Value {
    json!({
        "hooks": [
            {
                "type": "http",
                "url": url,
                "headers": {
                    "Authorization": format!("Bearer {token}"),
                    APPROVAL_HOOK_MARKER_HEADER: format!("{FOCUSD_AGENT_HOOK_SIGNATURE}{marker}"),
                },
                "timeout": APPROVAL_HOOK_TIMEOUT_SECONDS
            }
        ]
    })
}

/// Adds `entries` under their events, after dropping the FocuSD hooks already there. Each event
/// is cleared once, so an event with two entries (PermissionRequest) keeps both.
pub(super) fn install_claude_code_hook_events(
    hooks: &mut Map<String, Value>,
    entries: Vec<(&'static str, Value)>,
) {
    let mut cleared: Vec<&str> = Vec::new();
    for (event_name, entry) in entries {
        if !cleared.contains(&event_name) {
            cleared.push(event_name);
            let kept = unmanaged_entries(hooks, event_name);
            hooks.insert(event_name.to_string(), Value::Array(kept));
        }
        if let Some(Value::Array(list)) = hooks.get_mut(event_name) {
            list.push(entry);
        }
    }
}

/// The user's own entries of `event_name`, taken out of `hooks`.
fn unmanaged_entries(hooks: &mut Map<String, Value>, event_name: &str) -> Vec<Value> {
    hooks
        .remove(event_name)
        .and_then(|value| match value {
            Value::Array(entries) => Some(entries),
            _ => None,
        })
        .unwrap_or_default()
        .into_iter()
        .filter_map(remove_managed_claude_code_hooks)
        .collect()
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

/// The session script (focusd-agent-session.ps1) for SessionStart (`start`) or SessionEnd (`end`).
pub(super) fn claude_code_session_hook_entry(script_path: &Path, event: &str) -> Value {
    claude_code_hook_entry(
        "powershell.exe",
        vec![
            "-NoProfile".to_string(),
            "-ExecutionPolicy".to_string(),
            "Bypass".to_string(),
            "-File".to_string(),
            script_path.to_string_lossy().to_string(),
            "claudeCode".to_string(),
            event.to_string(),
        ],
        15,
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
        install_claude_code_hook_events(&mut hooks, claude_code_hook_entries(running, status));

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
            json!("permission_prompt|elicitation_dialog|agent_needs_input")
        );
        assert_eq!(last_arg("Stop"), Some(json!("completed")));
        // Session start and end record the session's process and terminal, the start in the background.
        assert_eq!(last_arg("SessionStart"), Some(json!("start")));
        assert_eq!(hooks["SessionStart"][0]["hooks"][0]["async"], json!(true));
        assert_eq!(last_arg("SessionEnd"), Some(json!("end")));
        assert!(hooks["SessionEnd"][0]["hooks"][0].get("async").is_none());
        assert!(hooks["SessionStart"][0]["hooks"][0]["args"][4]
            .as_str()
            .is_some_and(|path| path.ends_with("focusd-agent-session.ps1")));
        assert_eq!(last_arg("PermissionRequest"), Some(json!("notification")));
        assert!(hooks["PermissionRequest"][0].get("matcher").is_none());
    }

    #[test]
    fn approval_hook_sits_beside_the_status_hook_and_repair_replaces_it() {
        let running = Path::new(r"C:\focusd-agent-running.cmd");
        let status = Path::new(r"C:\focusd-agent-status.ps1");
        let approval = |port: u16| ApprovalHook {
            url: format!("http://127.0.0.1:{port}/claude/permission-request"),
            question_url: Some(format!("http://127.0.0.1:{port}/claude/ask-user-question")),
            token: "t".to_string(),
        };
        let mine = json!({ "hooks": [{ "type": "command", "command": "my-own-hook" }] });
        let mut hooks = Map::new();
        hooks.insert("PermissionRequest".to_string(), json!([mine]));

        install_claude_code_hook_events(&mut hooks, claude_code_installed_entries(running, status, Some(&approval(47830))));
        // The endpoint moved to another port: Install/Repair writes the new address once.
        install_claude_code_hook_events(&mut hooks, claude_code_installed_entries(running, status, Some(&approval(51000))));

        let entries = hooks["PermissionRequest"].as_array().unwrap();
        assert_eq!(entries.len(), 3, "the user's hook, the status hook and the approval hook");
        assert_eq!(entries[0], mine);
        assert_eq!(entries[1]["hooks"][0]["type"], json!("command"));
        let hook = &entries[2]["hooks"][0];
        assert_eq!(hook["type"], json!("http"));
        assert_eq!(hook["url"], json!("http://127.0.0.1:51000/claude/permission-request"));
        assert_eq!(hook["headers"]["Authorization"], json!("Bearer t"));
        assert_eq!(hook["timeout"], json!(APPROVAL_HOOK_TIMEOUT_SECONDS));
        assert!(value_contains_focusd_hook_signature(hook));

        // The question hook: after the match-all status hook, only for AskUserQuestion.
        let pre_tool = hooks["PreToolUse"].as_array().unwrap();
        assert_eq!(pre_tool.len(), 2, "the status hook and the question hook");
        assert_eq!(pre_tool[0]["matcher"], json!("*"));
        assert_eq!(pre_tool[1]["matcher"], json!("AskUserQuestion"));
        let question = &pre_tool[1]["hooks"][0];
        assert_eq!(question["url"], json!("http://127.0.0.1:51000/claude/ask-user-question"));
        assert_eq!(question["timeout"], json!(APPROVAL_HOOK_TIMEOUT_SECONDS));
        assert!(value_contains_focusd_hook_signature(question));

        // Without the endpoint only the status hooks are written, and the old approval hooks go.
        install_claude_code_hook_events(&mut hooks, claude_code_installed_entries(running, status, None));
        assert_eq!(hooks["PermissionRequest"].as_array().unwrap().len(), 2);
        assert_eq!(hooks["PreToolUse"].as_array().unwrap().len(), 1);
    }
}
