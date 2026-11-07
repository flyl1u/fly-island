//! Approving agent tool calls on the island (B6 phase 2), and answering Claude Code's
//! AskUserQuestion there (phase 3, `PreToolUse` hook at `/claude/ask-user-question`). Claude Code's `PermissionRequest` HTTP
//! hook, and Codex's through a forwarding command hook, post to an endpoint on 127.0.0.1 and wait;
//! the island shows a card and answers with the user's choice. While the hook waits the terminal
//! shows no prompt, so every way out (a limit, "handle in terminal", the island quitting) gives
//! the decision back to the agent, which then asks in the terminal as usual. Newer Claude Code
//! versions show their own prompt while the hook waits and leave the hook's connection open once
//! the user answers there; an activity hook (`PostToolUse`, `Stop`, ...) tells the island, which
//! then closes the card (B6.2.7).
//! Test results behind this: docs/architecture/agent-island-interaction-tasks.md, 实测记录.

mod config;
mod decision;
mod http;
mod queue;
mod server;
#[cfg(test)]
mod tests;

use std::{
    sync::{Arc, OnceLock},
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};

pub(crate) use decision::Agent;
use decision::{Answers, Decision};
pub(crate) use queue::ApprovalRequest;
use queue::{CloseReason, Outcome};
use server::{ApprovalEvent, Shared};

// Mirrored in src/features/agent-status/approvals/api.ts.
const REQUESTED_EVENT: &str = "agent-approval-requested";
const CLOSED_EVENT: &str = "agent-approval-closed";
/// After this the request goes back to the terminal; the installed hooks wait longer (150 s).
const WAIT_LIMIT: Duration = Duration::from_secs(120);

struct Service {
    shared: Arc<Shared>,
    port: u16,
    token: String,
}

static SERVICE: OnceLock<Service> = OnceLock::new();

/// Where the installed hooks send their requests.
pub(crate) struct ApprovalEndpoint {
    pub port: u16,
    pub token: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ClosedPayload {
    id: u64,
    reason: CloseReason,
}

/// Starts the endpoint, on the port saved last time when it is free. It answers every request
/// by handing it back until the island switches approvals on (`set_agent_approval_enabled`).
pub fn init(app: &AppHandle) -> Result<(), String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?
        .join(config::CONFIG_FILE_NAME);
    let (mut saved, mut changed) = config::load_config(&path)?;
    let emitter = app.clone();
    let notify: server::Notify = Arc::new(move |event| {
        let _ = match event {
            ApprovalEvent::Requested(request) => emitter.emit(REQUESTED_EVENT, request),
            ApprovalEvent::Closed { id, reason } => emitter.emit(CLOSED_EVENT, ClosedPayload { id, reason }),
        };
    });
    let (shared, port) = server::listen(saved.port, saved.token.clone(), WAIT_LIMIT, notify)?;
    if port != saved.port {
        // The saved port was taken: the hooks need installing again with this one.
        saved.port = port;
        changed = true;
    }
    if changed {
        config::save_config(&path, &saved)?;
    }
    let _ = SERVICE.set(Service { shared, port, token: saved.token });
    Ok(())
}

/// Hands every waiting request back to the terminal; called when the island quits.
pub fn shutdown() {
    if let Some(service) = SERVICE.get() {
        service.shared.shut_down();
    }
}

/// The endpoint's port and token, for installing the hooks; None if it did not start.
pub(crate) fn endpoint() -> Option<ApprovalEndpoint> {
    SERVICE.get().map(|service| ApprovalEndpoint { port: service.port, token: service.token.clone() })
}

/// The token the hooks on the SSH remote computer `host` carry; None if the endpoint did not start.
pub(crate) fn remote_hook_token(host: &str) -> Option<String> {
    SERVICE.get().map(|service| config::remote_token(&service.token, host))
}

/// The URL `agent`'s approval hook (`PermissionRequest`) posts to.
pub(crate) fn hook_url(agent: Agent) -> Option<String> {
    endpoint().map(|endpoint| format!("http://127.0.0.1:{}{}", endpoint.port, agent.path()))
}

/// The URL Claude Code's `PreToolUse` hook for `AskUserQuestion` posts to (phase 3).
pub(crate) fn question_hook_url() -> Option<String> {
    endpoint().map(|endpoint| format!("http://127.0.0.1:{}{}", endpoint.port, decision::QUESTION_PATH))
}

/// The URL Claude Code's activity hook posts to: tool calls done and turns ended, which close the
/// cards of requests answered in the terminal (B6.2.7).
pub(crate) fn activity_hook_url() -> Option<String> {
    endpoint().map(|endpoint| format!("http://127.0.0.1:{}{}", endpoint.port, decision::ACTIVITY_PATH))
}

fn service() -> Result<&'static Service, String> {
    SERVICE.get().ok_or_else(|| "The approval endpoint is not running.".to_string())
}

/// Turns approving on the island on or off. Off, requests go straight back to the terminal.
#[tauri::command]
pub fn set_agent_approval_enabled(enabled: bool) -> Result<(), String> {
    service()?.shared.set_enabled(enabled);
    Ok(())
}

/// Answers a shown request. Approvals: `allow`, `deny` (with an optional `message` for the
/// agent), `allowAlways` (for this session, Claude Code) or `terminal` (ask there instead).
/// Questions: `answer` with `answers` (question text -> an option's label, several joined by
/// ", ", or free text), or `terminal`.
#[tauri::command]
pub fn agent_approval_decide(
    id: u64,
    decision: Decision,
    message: Option<String>,
    answers: Option<Answers>,
) -> Result<(), String> {
    service()?.shared.decide(id, Outcome { decision, message, answers })
}

/// The requests shown now, one per session, for a window that (re)loads while they wait.
#[tauri::command]
pub fn agent_approval_pending() -> Result<Vec<ApprovalRequest>, String> {
    Ok(service()?.shared.pending())
}

macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::agent_approval::set_agent_approval_enabled,
            crate::agent_approval::agent_approval_decide,
            crate::agent_approval::agent_approval_pending,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
