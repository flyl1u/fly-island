//! Clicking a session on the Agent page: find the window that shows it and bring it forward, and
//! in Orca switch to its tab. The order tried is in docs/agent-status-hooks.md, "Switching to a
//! Session's Window". Every attempt is written to agent-focus.log (focus_log.rs).

use std::path::Path;

use super::focus_log::Attempt;
use super::orca;
use super::session_memory::{self, SeenSession};
use super::session_process::{ancestor_chain, session_process_chain};
use super::window_focus::{self, app_name, SessionHints};
use crate::system::windows_home_dir;
use crate::win32;

/// Folder names above a session's folder that an editor might have open instead.
const MAX_ANCESTORS: usize = 4;

/// The last folder name of `cwd`, then the ones above it, nearest first.
pub(super) fn folder_names(cwd: &str) -> (Option<String>, Vec<String>) {
    let mut names = cwd
        .trim_end_matches(['\\', '/'])
        .split(['\\', '/'])
        .filter(|part| !part.is_empty() && !part.ends_with(':'))
        .rev()
        .map(str::to_string);
    let folder = names.next();
    (folder, names.take(MAX_ANCESTORS).collect())
}

/// Whether the process remembered for a session is still the same one (not a reused id).
pub(super) fn still_running(seen: &SeenSession, started_now: Option<u64>) -> bool {
    started_now.is_some() && seen.started.is_none_or(|started| Some(started) == started_now)
}

/// The session's process and its ancestors. A running session is in Claude Code's registry; a
/// session that was cleared or resumed under a new id may still run in the process remembered.
fn process_chain(is_codex: bool, session_id: Option<&str>, seen: Option<&SeenSession>, log: &mut Attempt) -> Vec<u32> {
    let Some(id) = session_id.filter(|_| !is_codex) else {
        return Vec::new();
    };
    if let Ok(home_dir) = windows_home_dir() {
        let chain = session_process_chain(&home_dir, id);
        if !chain.is_empty() {
            log.note(format!("process=registry({})", chain.len()));
            return chain;
        }
    }
    match seen {
        Some(seen) if still_running(seen, win32::process_times::start_time(seen.pid)) => {
            let chain = ancestor_chain(seen.pid, &win32::process_tree::parent_process_ids(), win32::process_times::start_time);
            log.note(format!("process=remembered({})", chain.len()));
            chain
        }
        Some(_) => {
            log.note("process=ended");
            Vec::new()
        }
        None => {
            log.note("process=unknown");
            Vec::new()
        }
    }
}

struct Lookup<'a> {
    app_dir: Option<&'a Path>,
    is_codex: bool,
    session_id: Option<&'a str>,
    cwd: Option<&'a str>,
    title: Option<&'a str>,
}

/// The session's Orca tab: from its process's environment, what was remembered, the SessionStart
/// record, then (no process, Orca open) Orca's own list by tab title or, for Codex, by folder.
fn orca_handle(lookup: &Lookup, chain: &[u32], seen: Option<&SeenSession>, log: &mut Attempt) -> Option<String> {
    let found = |source: &str, handle: Option<String>, log: &mut Attempt| {
        if handle.is_some() {
            log.note(format!("tab={source}"));
        }
        handle
    };
    if let Some(handle) = found("process", chain.first().and_then(|&pid| orca::terminal_handle_of_process(pid)), log) {
        return Some(handle);
    }
    if let Some(handle) = found("remembered", seen.and_then(|seen| seen.orca_handle.clone()), log) {
        return Some(handle);
    }
    let record = lookup.session_id.zip(lookup.app_dir).and_then(|(id, app_dir)| orca::terminal_handle_for(app_dir, id));
    if let Some(handle) = found("hook", record, log) {
        return Some(handle);
    }
    if !chain.is_empty() {
        return None;
    }
    let orca_exe = window_focus::open_app_exe(orca::ORCA_APP)?;
    let Some(list) = orca::list_terminals(Path::new(&orca_exe)) else {
        log.note("tab=orca-list-failed");
        return None;
    };
    let agent = if lookup.is_codex { "codex" } else { "claude" };
    let by_title = lookup.title.and_then(|title| orca::agent_terminal_titled(&list, agent, title));
    if let Some(handle) = found("orca-title", by_title, log) {
        return Some(handle);
    }
    let by_folder = lookup.cwd.filter(|_| lookup.is_codex).and_then(|cwd| orca::only_agent_terminal(&list, agent, cwd));
    found("orca-folder", by_folder, log)
}

/// Finds and brings forward the window of a session; false when no window could be found.
pub(super) fn focus_session(
    app_dir: Option<&Path>,
    provider: &str,
    cwd: Option<&str>,
    title: Option<&str>,
    session_id: Option<&str>,
) -> bool {
    let is_codex = provider == "codex";
    let session_id = session_id.filter(|id| !id.is_empty());
    let mut log = Attempt::new(provider, session_id);
    let seen = session_id.and_then(|id| session_memory::get(app_dir, id));
    let chain = process_chain(is_codex, session_id, seen.as_ref(), &mut log);
    let lookup = Lookup { app_dir, is_codex, session_id, cwd, title };
    let handle = orca_handle(&lookup, &chain, seen.as_ref(), &mut log);

    // With no process to follow, the program the session was last seen in is the best guess.
    let remembered_app = seen.as_ref().and_then(|seen| seen.host_exe.as_deref()).map(app_name);
    let prefer_app = if handle.is_some() { Some(orca::ORCA_APP.to_string()) } else { remembered_app };
    if let Some(app) = &prefer_app {
        log.note(format!("prefer={app}"));
    }
    let (folder, ancestors) = cwd.map(folder_names).unwrap_or_default();
    let hints = SessionHints { folder: folder.as_deref(), ancestors: &ancestors, title, is_codex };
    let Some(focused) = window_focus::focus_session_window(&hints, &chain, prefer_app.as_deref()) else {
        log.finish(app_dir, "not found");
        return false;
    };
    log.note(format!("window={}", focused.app));
    if let Some(handle) = handle.filter(|_| focused.app == orca::ORCA_APP) {
        let switched = win32::process::image_path(focused.process_id)
            .is_some_and(|orca_exe| orca::switch_terminal(Path::new(&orca_exe), &handle));
        log.note(if switched { "switch=sent" } else { "switch=failed" });
    }
    log.finish(app_dir, if focused.in_front { "focused" } else { "found, flashed (Windows kept it behind)" });
    true
}
