//! What a `PermissionRequest` hook sends, and what it gets back for each choice on the island.
//! The answer format is Claude Code's (docs/architecture/agent-island-interaction-tasks.md,
//! 实测记录); Codex's command hook forwards the same input and passes the answer back.

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

/// The agent a request came from, named as the session list names providers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Agent {
    ClaudeCode,
    Codex,
}

impl Agent {
    /// The endpoint path for each agent's hook.
    pub(super) fn from_path(path: &str) -> Option<Self> {
        match path {
            "/claude/permission-request" => Some(Self::ClaudeCode),
            "/codex/permission-request" => Some(Self::Codex),
            _ => None,
        }
    }

    pub(super) fn path(self) -> &'static str {
        match self {
            Self::ClaudeCode => "/claude/permission-request",
            Self::Codex => "/codex/permission-request",
        }
    }
}

/// The parts of a hook's input the island shows and answers with.
#[derive(Debug, Clone, PartialEq)]
pub(super) struct HookInput {
    pub session_id: String,
    pub cwd: Option<String>,
    pub tool_name: String,
    pub tool_input: Value,
    /// Claude Code's "always allow" rules for this call, passed back for "allow always".
    pub permission_suggestions: Option<Value>,
}

impl HookInput {
    pub(super) fn parse(body: &[u8]) -> Result<Self, &'static str> {
        let input: Value = serde_json::from_slice(body).map_err(|_| "The body is not JSON.")?;
        let text = |key: &str| input[key].as_str().filter(|value| !value.is_empty()).map(str::to_string);
        Ok(Self {
            session_id: text("session_id").ok_or("No session_id.")?,
            cwd: text("cwd"),
            tool_name: text("tool_name").ok_or("No tool_name.")?,
            tool_input: input["tool_input"].clone(),
            permission_suggestions: Some(input["permission_suggestions"].clone()).filter(|value| !value.is_null()),
        })
    }

    /// Questions are answered in the terminal until the island can ask them (phase 3); after its
    /// PreToolUse hook, AskUserQuestion comes through PermissionRequest a second time.
    pub(super) fn is_question(&self) -> bool {
        self.tool_name == "AskUserQuestion"
    }
}

/// The user's choice on the island.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Decision {
    Allow,
    Deny,
    /// Allow, and keep allowing calls like it for the rest of this session (Claude Code).
    AllowAlways,
    /// Hand it back: the agent shows its own approval prompt in the terminal.
    Terminal,
}

const DEFAULT_DENY_MESSAGE: &str = "Denied in FocuSD Island";

/// The hook's answer. `{}` gives the decision back to the agent, which then asks in the terminal.
pub(super) fn hook_response(decision: Option<Decision>, message: Option<&str>, suggestions: Option<&Value>) -> String {
    let decision = match decision {
        None | Some(Decision::Terminal) => return "{}".to_string(),
        Some(Decision::Allow) => json!({ "behavior": "allow" }),
        Some(Decision::AllowAlways) => match suggestions.and_then(session_only) {
            Some(rules) => json!({ "behavior": "allow", "updatedPermissions": rules }),
            None => json!({ "behavior": "allow" }),
        },
        Some(Decision::Deny) => json!({
            "behavior": "deny",
            "message": message.map(str::trim).filter(|text| !text.is_empty()).unwrap_or(DEFAULT_DENY_MESSAGE),
        }),
    };
    json!({ "hookSpecificOutput": { "hookEventName": "PermissionRequest", "decision": decision } }).to_string()
}

/// The suggested rules, each kept for this session only rather than written to a settings file.
fn session_only(suggestions: &Value) -> Option<Value> {
    let rules: Vec<Value> = suggestions
        .as_array()?
        .iter()
        .filter_map(Value::as_object)
        .map(|rule| {
            let mut rule: Map<String, Value> = rule.clone();
            rule.insert("destination".into(), Value::from("session"));
            Value::Object(rule)
        })
        .collect();
    (!rules.is_empty()).then_some(Value::Array(rules))
}
