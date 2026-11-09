//! How freely a session may act, as the Agent page marks it: Claude Code's permission mode, or
//! Codex's approval and sandbox policy, reduced to "default", "auto", "bypass", "acceptEdits" or
//! "plan". Pure parsing of undocumented records; anything unknown counts as "default".

use serde_json::Value;

/// Claude Code's `permissionMode` on a prompt record.
pub(super) fn claude_permission_mode(raw: &str) -> &'static str {
    match raw {
        "bypassPermissions" => "bypass",
        "auto" => "auto",
        "acceptEdits" => "acceptEdits",
        "plan" => "plan",
        _ => "default",
    }
}

/// The payload of a Codex `turn_context` record: never asking with full access is "bypass", never
/// asking inside the sandbox "auto". `None` when the record names no approval policy.
pub(super) fn codex_permission_mode(payload: &Value) -> Option<&'static str> {
    let approval = payload["approval_policy"].as_str()?;
    let full_access = payload["sandbox_policy"]["type"] == "danger-full-access";
    Some(match (approval, full_access) {
        ("never", true) => "bypass",
        ("never", false) => "auto",
        _ => "default",
    })
}

/// Ids of the subagents a Claude Code assistant message started (`Agent`, formerly `Task`).
pub(super) fn claude_subagent_calls(content: &Value) -> impl Iterator<Item = &str> {
    content
        .as_array()
        .into_iter()
        .flatten()
        .filter(|block| block["type"] == "tool_use" && matches!(block["name"].as_str(), Some("Agent" | "Task")))
        .filter_map(|block| block["id"].as_str())
}

/// Ids of the tool calls a Claude Code user record answers.
pub(super) fn claude_tool_results(content: &Value) -> impl Iterator<Item = &str> {
    content
        .as_array()
        .into_iter()
        .flatten()
        .filter(|block| block["type"] == "tool_result")
        .filter_map(|block| block["tool_use_id"].as_str())
}
