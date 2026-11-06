//! Approval requests waiting for the user, queued per session: the island shows one card per
//! session at a time, and the next request of that session only once the one before it closes.
//! Each request's connection thread waits here for the user's choice.

use serde::Serialize;
use serde_json::Value;

use super::decision::{Agent, Decision, HookInput};

/// A request as the island's card shows it (event `agent-approval-requested`).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalRequest {
    pub id: u64,
    pub agent: Agent,
    pub session_id: String,
    pub cwd: Option<String>,
    pub tool_name: String,
    pub tool_input: Value,
    pub permission_suggestions: Option<Value>,
    /// Unix milliseconds.
    pub received_at: i64,
}

/// Why a card went away (event `agent-approval-closed`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum CloseReason {
    /// Allowed or denied on the island.
    Decided,
    /// Waited past the limit: handed back to the terminal.
    Timeout,
    /// The agent hung up (the user pressed Esc, or the agent quit).
    Disconnected,
    /// "Handle in terminal" on the island.
    HandedBack,
    /// The island quit: handed back to the terminal.
    Shutdown,
}

/// The user's answer, waiting for the request's thread to pick it up.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Outcome {
    pub decision: Decision,
    pub message: Option<String>,
}

struct Entry {
    request: ApprovalRequest,
    outcome: Option<Outcome>,
}

#[derive(Default)]
pub(super) struct Queue {
    entries: Vec<Entry>,
    last_id: u64,
    shutting_down: bool,
}

impl Queue {
    /// Queues a request. Returns it, and whether it is the first of its session (shown now).
    pub fn push(&mut self, agent: Agent, input: HookInput, received_at: i64) -> (ApprovalRequest, bool) {
        self.last_id += 1;
        let request = ApprovalRequest {
            id: self.last_id,
            agent,
            session_id: input.session_id,
            cwd: input.cwd,
            tool_name: input.tool_name,
            tool_input: input.tool_input,
            permission_suggestions: input.permission_suggestions,
            received_at,
        };
        let shown = !self.entries.iter().any(|entry| same_session(&entry.request, &request));
        self.entries.push(Entry { request: request.clone(), outcome: None });
        (request, shown)
    }

    /// Records the user's choice for a shown request.
    pub fn decide(&mut self, id: u64, decision: Decision, message: Option<String>) -> Result<(), String> {
        let shown = self.shown_ids();
        let entry = self
            .entries
            .iter_mut()
            .find(|entry| entry.request.id == id)
            .ok_or_else(|| "This approval request has already closed.".to_string())?;
        if !shown.contains(&id) {
            return Err("This approval request is still queued behind another one.".to_string());
        }
        entry.outcome.get_or_insert(Outcome { decision, message });
        Ok(())
    }

    /// The choice made for `id`, if any.
    pub fn outcome(&self, id: u64) -> Option<Outcome> {
        self.entries.iter().find(|entry| entry.request.id == id)?.outcome.clone()
    }

    /// Takes a request out. Returns the next request of its session, which is shown now.
    pub fn remove(&mut self, id: u64) -> Option<ApprovalRequest> {
        let index = self.entries.iter().position(|entry| entry.request.id == id)?;
        let removed = self.entries.remove(index).request;
        let was_shown = !self.entries[..index].iter().any(|entry| same_session(&entry.request, &removed));
        if !was_shown {
            return None;
        }
        self.entries
            .iter()
            .find(|entry| same_session(&entry.request, &removed))
            .map(|entry| entry.request.clone())
    }

    /// The requests shown now: the first of each session, oldest first.
    pub fn shown(&self) -> Vec<ApprovalRequest> {
        let ids = self.shown_ids();
        self.entries.iter().filter(|entry| ids.contains(&entry.request.id)).map(|entry| entry.request.clone()).collect()
    }

    fn shown_ids(&self) -> Vec<u64> {
        let mut ids: Vec<u64> = Vec::new();
        for (index, entry) in self.entries.iter().enumerate() {
            if !self.entries[..index].iter().any(|before| same_session(&before.request, &entry.request)) {
                ids.push(entry.request.id);
            }
        }
        ids
    }

    /// From now on every waiting request hands back to the terminal, and new ones do at once.
    pub fn shut_down(&mut self) {
        self.shutting_down = true;
    }

    pub fn is_shutting_down(&self) -> bool {
        self.shutting_down
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }
}

fn same_session(a: &ApprovalRequest, b: &ApprovalRequest) -> bool {
    a.agent == b.agent && a.session_id == b.session_id
}
