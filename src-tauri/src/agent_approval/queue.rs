//! Approval requests waiting for the user, queued per session: the island shows one card per
//! session at a time, and the next request of that session only once the one before it closes.
//! Each request's connection thread waits here for the user's choice.

use serde::Serialize;
use serde_json::Value;

use super::decision::{Activity, Agent, Answers, Decision, HookInput, Kind, Settled};

/// A request as the island's card shows it (event `agent-approval-requested`).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalRequest {
    pub id: u64,
    pub agent: Agent,
    /// An approval, or a question (Claude Code's AskUserQuestion; `tool_input.questions`).
    pub kind: Kind,
    pub session_id: String,
    pub cwd: Option<String>,
    pub tool_name: String,
    pub tool_input: Value,
    pub permission_suggestions: Option<Value>,
    /// Unix milliseconds.
    pub received_at: i64,
    /// The subagent that asked; None for the main agent. Not shown, only matched (B6.2.7).
    #[serde(skip)]
    pub agent_id: Option<String>,
    /// The SSH remote computer the session runs on; left out for this one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remote_host: Option<String>,
}

/// Why a card went away (event `agent-approval-closed`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum CloseReason {
    /// Allowed, denied or answered on the island.
    Decided,
    /// Waited past the limit: handed back to the terminal.
    Timeout,
    /// The agent hung up (the user pressed Esc, or the agent quit).
    Disconnected,
    /// "Handle in terminal" on the island.
    HandedBack,
    /// The island quit: handed back to the terminal.
    Shutdown,
    /// The session went on without the island (the user answered in the terminal).
    AnsweredElsewhere,
}

/// The user's answer, waiting for the request's thread to pick it up.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Outcome {
    pub decision: Decision,
    pub message: Option<String>,
    /// For `Decision::Answer`.
    pub answers: Option<Answers>,
}

struct Entry {
    request: ApprovalRequest,
    outcome: Option<Outcome>,
    /// Answered without the island; the request's thread closes the card.
    elsewhere: bool,
}

#[derive(Default)]
pub(super) struct Queue {
    entries: Vec<Entry>,
    last_id: u64,
    shutting_down: bool,
}

impl Queue {
    /// Queues a request. Returns it, and whether it is the first of its session (shown now).
    pub fn push(&mut self, agent: Agent, kind: Kind, input: HookInput, received_at: i64) -> (ApprovalRequest, bool) {
        self.last_id += 1;
        let request = ApprovalRequest {
            id: self.last_id,
            agent,
            kind,
            session_id: input.session_id,
            cwd: input.cwd,
            tool_name: input.tool_name,
            tool_input: input.tool_input,
            permission_suggestions: input.permission_suggestions,
            received_at,
            agent_id: input.agent_id,
            remote_host: input.remote_host,
        };
        let shown = !self.entries.iter().any(|entry| same_session(&entry.request, &request));
        self.entries.push(Entry { request: request.clone(), outcome: None, elsewhere: false });
        (request, shown)
    }

    /// `agent`'s session did `activity`, so what it waited for was answered elsewhere. A finished
    /// turn settles all of that agent's requests; a tool call settles the oldest request for the
    /// same call, or, when none has exactly that input, the only request for that tool. Returns
    /// the ids settled now; the island answers them with `{}`, which the agent no longer reads.
    pub fn settle_elsewhere(&mut self, agent: Agent, activity: &Activity) -> Vec<u64> {
        let open = |entry: &&mut Entry| {
            let request = &entry.request;
            entry.outcome.is_none()
                && !entry.elsewhere
                && request.agent == agent
                && request.session_id == activity.session_id
                && request.agent_id == activity.agent_id
        };
        let mut settled: Vec<u64> = Vec::new();
        match &activity.settled {
            Settled::Turn => {
                for entry in self.entries.iter_mut().filter(|entry| open(entry)) {
                    entry.elsewhere = true;
                    settled.push(entry.request.id);
                }
            }
            Settled::ToolCall { tool_name, tool_input } => {
                let same_tool: Vec<&mut Entry> =
                    self.entries.iter_mut().filter(|entry| open(entry) && entry.request.tool_name == *tool_name).collect();
                let exact = same_tool.iter().position(|entry| entry.request.tool_input == *tool_input);
                let index = exact.or((same_tool.len() == 1).then_some(0));
                if let Some(entry) = index.and_then(|index| same_tool.into_iter().nth(index)) {
                    entry.elsewhere = true;
                    settled.push(entry.request.id);
                }
            }
        }
        settled
    }

    /// Whether `id` was answered without the island.
    pub fn answered_elsewhere(&self, id: u64) -> bool {
        self.entries.iter().any(|entry| entry.request.id == id && entry.elsewhere)
    }

    /// Records the user's choice for a shown request. A question takes answers or a hand-back;
    /// an approval takes anything but answers.
    pub fn decide(&mut self, id: u64, outcome: Outcome) -> Result<(), String> {
        let shown = self.shown_ids();
        let entry = self
            .entries
            .iter_mut()
            .find(|entry| entry.request.id == id)
            .ok_or_else(|| "This approval request has already closed.".to_string())?;
        if !shown.contains(&id) {
            return Err("This approval request is still queued behind another one.".to_string());
        }
        if !outcome.decision.fits(entry.request.kind) {
            return Err(format!("A {:?} request cannot take {:?}.", entry.request.kind, outcome.decision));
        }
        if outcome.decision == Decision::Answer && outcome.answers.as_ref().is_none_or(Answers::is_empty) {
            return Err("Answering needs at least one answer.".to_string());
        }
        entry.outcome.get_or_insert(outcome);
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
