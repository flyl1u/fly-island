//! What the SessionStart / SessionEnd hooks recorded about a session (focusd-agent-session.ps1):
//! `agent-sessions/<session id>.json` in the app data folder, with the agent's process id and
//! start time, its folder and its terminal (Orca handle, Windows Terminal session). These come
//! from the hooks Claude Code and Codex document, so they are preferred over Claude Code's
//! undocumented `~/.claude/sessions` registry, which stays as a fallback.

use std::{fs, path::Path};

use serde::Deserialize;

use crate::win32;

pub(super) const DIR_NAME: &str = "agent-sessions";
/// Start times read through WMI keep microseconds; the kernel's are in 100 ns ticks.
const START_TIME_TOLERANCE: u64 = 10;

#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SessionRecord {
    pub(super) provider: Option<String>,
    /// `startup`, `resume`, `clear`, `compact` or `fork`.
    pub(super) source: Option<String>,
    pub(super) pid: Option<u32>,
    /// The process's start, 100 ns ticks since 1601 (UTC).
    pub(super) pid_started: Option<u64>,
    pub(super) orca_handle: Option<String>,
    pub(super) wt_session: Option<String>,
    pub(super) term_program: Option<String>,
    pub(super) started_at: Option<i64>,
    pub(super) ended_at: Option<i64>,
    /// `clear`, `resume`, `logout`, `prompt_input_exit` or `other`.
    pub(super) end_reason: Option<String>,
}

/// Whether `id` can name a record file (and nothing else).
pub(super) fn is_session_id(id: &str) -> bool {
    (1..=128).contains(&id.len()) && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

pub(super) fn parse(text: &str) -> Option<SessionRecord> {
    serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()
}

/// The record of `session_id`, if its hook wrote one.
pub(super) fn read(app_dir: &Path, session_id: &str) -> Option<SessionRecord> {
    if !is_session_id(session_id) {
        return None;
    }
    parse(&fs::read_to_string(app_dir.join(DIR_NAME).join(format!("{session_id}.json"))).ok()?)
}

/// Whether a process that started at `actual` is the one recorded as starting at `recorded`.
pub(super) fn same_start(recorded: Option<u64>, actual: Option<u64>) -> bool {
    match (recorded, actual) {
        (Some(recorded), Some(actual)) => recorded.abs_diff(actual) <= START_TIME_TOLERANCE,
        (None, Some(_)) => true,
        _ => false,
    }
}

impl SessionRecord {
    /// The recorded agent process, if it still runs (the same process, not a reused id). After
    /// `/clear` or `/resume` the process carries on under a new session id, so an ended record can
    /// still point at a live process.
    pub(super) fn live_pid(&self) -> Option<u32> {
        let pid = self.pid.filter(|pid| *pid != 0)?;
        same_start(self.pid_started, win32::process_times::start_time(pid)).then_some(pid)
    }

    /// Whether the session is over. SessionStart rewrites the record, so an end time belongs to
    /// the latest start. Without a recorded process (it was not found) only the end time counts.
    pub(super) fn has_ended(&self) -> bool {
        self.ended_at.is_some() || (self.pid.is_some_and(|pid| pid != 0) && self.live_pid().is_none())
    }

    /// The recorded Orca tab, if it looks like a handle.
    pub(super) fn orca_handle(&self) -> Option<String> {
        self.orca_handle.clone().filter(|handle| super::orca::is_terminal_handle(handle))
    }
}
