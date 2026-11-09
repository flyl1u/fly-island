//! From an agent session to the processes that host it. Claude Code records every running
//! session in `~/.claude/sessions/<pid>.json` (`pid`, `sessionId`, `procStart`), so a session
//! leads to its `claude` process, and from there up the parent chain to the terminal or editor
//! that shows it (`claude` <- `pwsh` <- Orca's terminal host <- Orca).

use std::{collections::HashMap, fs, path::Path};

use serde_json::Value;

use crate::win32;

/// Parent links followed at most; real chains are 3-5 long.
const MAX_CHAIN: usize = 12;

/// The process of a running session: its id and, when recorded, its start time in 100 ns
/// ticks since 1601 (the same clock as `win32::process_times::start_time`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct SessionProcess {
    pub(super) pid: u32,
    pub(super) started: Option<u64>,
}

/// The session id and process of one `~/.claude/sessions/*.json` entry.
pub(super) fn session_entry(entry: &str) -> Option<(String, SessionProcess)> {
    let entry: Value = serde_json::from_str(entry).ok()?;
    let session_id = entry["sessionId"].as_str().filter(|id| !id.is_empty())?.to_string();
    let pid = u32::try_from(entry["pid"].as_u64()?).ok()?;
    let started = match &entry["procStart"] {
        Value::String(ticks) => ticks.parse().ok(),
        Value::Number(ticks) => ticks.as_u64(),
        _ => None,
    };
    Some((session_id, SessionProcess { pid, started }))
}

/// Every running Claude Code session: session id -> its live process id. A recorded start time
/// must match, so a process id reused by another program is not taken.
pub(super) fn running_sessions(home_dir: &Path) -> HashMap<String, u32> {
    let Ok(entries) = fs::read_dir(home_dir.join(".claude").join("sessions")) else {
        return HashMap::new();
    };
    entries
        .flatten()
        .filter(|entry| entry.path().extension().is_some_and(|extension| extension == "json"))
        .filter_map(|entry| fs::read_to_string(entry.path()).ok())
        .filter_map(|text| session_entry(&text))
        .filter(|(_, process)| {
            let actual = win32::process_times::start_time(process.pid);
            actual.is_some() && process.started.is_none_or(|started| Some(started) == actual)
        })
        .map(|(id, process)| (id, process.pid))
        .collect()
}

/// The live process of a Claude Code session, or `None` when the session is not running.
pub(super) fn find_session_process(home_dir: &Path, session_id: &str) -> Option<u32> {
    running_sessions(home_dir).remove(session_id)
}

/// `pid` and its ancestors, nearest first. Stops at a missing parent, a cycle, or a parent that
/// started after its child: that id was reused by a newer process after the real parent exited.
pub(super) fn ancestor_chain(
    pid: u32,
    parents: &HashMap<u32, u32>,
    started: impl Fn(u32) -> Option<u64>,
) -> Vec<u32> {
    let mut chain = vec![pid];
    let mut current = pid;
    while chain.len() < MAX_CHAIN {
        let Some(&parent) = parents.get(&current) else {
            break;
        };
        if parent == 0 || chain.contains(&parent) {
            break;
        }
        if let (Some(parent_started), Some(child_started)) = (started(parent), started(current)) {
            if parent_started > child_started {
                break;
            }
        }
        chain.push(parent);
        current = parent;
    }
    chain
}

/// The running session's process and its ancestors, nearest first; empty when the session is
/// not running or not a Claude Code session.
pub(super) fn session_process_chain(home_dir: &Path, session_id: &str) -> Vec<u32> {
    let Some(pid) = find_session_process(home_dir, session_id) else {
        return Vec::new();
    };
    ancestor_chain(pid, &win32::process_tree::parent_process_ids(), win32::process_times::start_time)
}
