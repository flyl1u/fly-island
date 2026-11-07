//! What the hooks send, and what they get back for each choice on the island: `PermissionRequest`
//! for approvals, and Claude Code's `PreToolUse` on `AskUserQuestion` for questions (phase 3).
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

/// What the island is asked for: an approval, or answers to a question.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Kind {
    Permission,
    Question,
}

/// Where Claude Code's `PreToolUse` hook for `AskUserQuestion` posts.
pub(super) const QUESTION_PATH: &str = "/claude/ask-user-question";
/// Where Claude Code's activity hook posts (`PostToolUse`, `Stop`, ...): the session moved on,
/// so an approval it asked for was answered elsewhere (B6.2.7).
pub(super) const ACTIVITY_PATH: &str = "/claude/activity";

/// The agent and the kind of request an endpoint path takes.
pub(super) fn route(path: &str) -> Option<(Agent, Kind)> {
    match path {
        "/claude/permission-request" => Some((Agent::ClaudeCode, Kind::Permission)),
        "/codex/permission-request" => Some((Agent::Codex, Kind::Permission)),
        QUESTION_PATH => Some((Agent::ClaudeCode, Kind::Question)),
        _ => None,
    }
}

impl Agent {
    /// The path of each agent's approval hook.
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
    /// The subagent that asked, when it was not the main agent.
    pub agent_id: Option<String>,
}

impl HookInput {
    pub(super) fn parse(body: &[u8]) -> Result<Self, &'static str> {
        let input: Value = serde_json::from_slice(body).map_err(|_| "The body is not JSON.")?;
        let text = |key: &str| text_field(&input, key);
        Ok(Self {
            session_id: text("session_id").ok_or("No session_id.")?,
            cwd: text("cwd"),
            tool_name: text("tool_name").ok_or("No tool_name.")?,
            tool_input: input["tool_input"].clone(),
            permission_suggestions: Some(input["permission_suggestions"].clone()).filter(|value| !value.is_null()),
            agent_id: text("agent_id"),
        })
    }

    /// Claude Code's AskUserQuestion, answered through its PreToolUse hook. Handed back there, or
    /// with no such hook, it then comes through PermissionRequest, which lets the terminal ask.
    pub(super) fn is_question(&self) -> bool {
        self.tool_name == "AskUserQuestion"
    }
}

fn text_field(input: &Value, key: &str) -> Option<String> {
    input[key].as_str().filter(|value| !value.is_empty()).map(str::to_string)
}

/// What a Claude Code session did after asking, which means its request was answered without the
/// island: in the terminal, which can show its own prompt while the hook waits and then leaves the
/// hook's connection open (found on Claude Code 2.1.x; the hooks used to block the prompt).
#[derive(Debug, Clone, PartialEq)]
pub(super) struct Activity {
    pub session_id: String,
    /// The subagent the event is about; None for the main agent.
    pub agent_id: Option<String>,
    pub settled: Settled,
}

#[derive(Debug, Clone, PartialEq)]
pub(super) enum Settled {
    /// One tool call ran, failed or was denied (`PostToolUse`, `PostToolUseFailure`,
    /// `PermissionDenied`): the request for that call is over.
    ToolCall { tool_name: String, tool_input: Value },
    /// The agent's turn ended or a new prompt came in (`Stop`, `SubagentStop`, `UserPromptSubmit`):
    /// nothing of that agent waits any more.
    Turn,
}

impl Activity {
    /// None for events that say nothing about a waiting request.
    pub(super) fn parse(body: &[u8]) -> Result<Option<Self>, &'static str> {
        let input: Value = serde_json::from_slice(body).map_err(|_| "The body is not JSON.")?;
        let session_id = text_field(&input, "session_id").ok_or("No session_id.")?;
        let agent_id = text_field(&input, "agent_id");
        let settled = match input["hook_event_name"].as_str().unwrap_or_default() {
            "PostToolUse" | "PostToolUseFailure" | "PermissionDenied" => Settled::ToolCall {
                tool_name: text_field(&input, "tool_name").ok_or("No tool_name.")?,
                tool_input: input["tool_input"].clone(),
            },
            "Stop" | "UserPromptSubmit" => return Ok(Some(Self { session_id, agent_id: None, settled: Settled::Turn })),
            // Without its agent_id a SubagentStop cannot say whose requests ended.
            "SubagentStop" if agent_id.is_some() => Settled::Turn,
            _ => return Ok(None),
        };
        Ok(Some(Self { session_id, agent_id, settled }))
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
    /// Answers to a question, given with the decision.
    Answer,
}

impl Decision {
    /// Whether a request of `kind` takes this decision: questions are answered or handed back.
    pub(super) fn fits(self, kind: Kind) -> bool {
        match kind {
            Kind::Permission => self != Self::Answer,
            Kind::Question => matches!(self, Self::Answer | Self::Terminal),
        }
    }
}

/// A question's answers by question text: an option's label, several joined by ", ", or free text.
pub type Answers = std::collections::BTreeMap<String, String>;

const DEFAULT_DENY_MESSAGE: &str = "Denied in FocuSD Island";

/// The hook's answer. `{}` gives the decision back to the agent, which then asks in the terminal.
pub(super) fn hook_response(decision: Option<Decision>, message: Option<&str>, suggestions: Option<&Value>) -> String {
    let decision = match decision {
        None | Some(Decision::Terminal | Decision::Answer) => return "{}".to_string(),
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

/// The `PreToolUse` hook's answer to a question: the tool runs with `answers` added to its input,
/// and the terminal shows no prompt. Without answers, `{}` lets the terminal ask as usual.
pub(super) fn question_response(answers: Option<&Answers>, tool_input: &Value) -> String {
    let Some(answers) = answers.filter(|answers| !answers.is_empty()) else {
        return "{}".to_string();
    };
    let mut input = tool_input.as_object().cloned().unwrap_or_default();
    input.insert("answers".into(), json!(answers));
    json!({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
            "updatedInput": input,
        }
    })
    .to_string()
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
