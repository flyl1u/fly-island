//! Clicking a session on the Agent page: find the window that shows it and bring it forward, and
//! in Orca, Windows Terminal or VS Code switch to its tab or terminal. The order tried is in
//! docs/agent-status-hooks.md, "Switching to a Session's Window". Every attempt is written to
//! agent-focus.log (focus_log.rs).

use std::path::Path;

use super::codex_process;
use super::editor_terminal::{self, EditorTerminal};
use super::focus_log::Attempt;
use super::orca;
use super::session_memory::{self, SeenSession};
use super::session_process::{ancestor_chain, session_process_chain};
use super::session_records::{self, SessionRecord};
use super::wezterm::{self, WEZTERM_APP};
use super::window_focus::{self, app_name, SessionHints};
use crate::system::windows_home_dir;
use crate::win32;

/// Windows Terminal's executable name; its tabs are switched through UI Automation.
const WINDOWS_TERMINAL_APP: &str = "windowsterminal";

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

/// The session's process and its ancestors: from its SessionStart record (Claude Code and Codex),
/// else Claude Code's registry or, for Codex, the only Codex CLI working in the session's folder
/// (`cwd`), else the process remembered for it. A session cleared or resumed under a new id keeps
/// running in the recorded process.
fn process_chain(
    is_codex: bool,
    session_id: Option<&str>,
    cwd: Option<&str>,
    record: Option<&SessionRecord>,
    seen: Option<&SeenSession>,
    log: &mut Attempt,
) -> Vec<u32> {
    let Some(id) = session_id else {
        return Vec::new();
    };
    if let Some(pid) = record.and_then(SessionRecord::live_pid) {
        let chain = ancestor_chain(pid, &win32::process_tree::parent_process_ids(), win32::process_times::start_time);
        log.note(format!("process=hook({})", chain.len()));
        return chain;
    }
    // Only Claude Code keeps a registry of running sessions.
    if let (false, Ok(home_dir)) = (is_codex, windows_home_dir()) {
        let chain = session_process_chain(&home_dir, id);
        if !chain.is_empty() {
            log.note(format!("process=registry({})", chain.len()));
            return chain;
        }
    }
    // Codex keeps no registry; its hooks may never have run (not trusted yet, or sandboxed).
    if let Some(pid) = cwd.filter(|_| is_codex).and_then(codex_process::cli_process_in) {
        let chain = ancestor_chain(pid, &win32::process_tree::parent_process_ids(), win32::process_times::start_time);
        log.note(format!("process=codex-folder({})", chain.len()));
        return chain;
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
    record: Option<&'a SessionRecord>,
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
    if let Some(handle) = found("hook", lookup.record.and_then(SessionRecord::orca_handle), log) {
        return Some(handle);
    }
    if let Some(handle) = found("remembered", seen.and_then(|seen| seen.orca_handle.clone()), log) {
        return Some(handle);
    }
    let record = lookup.session_id.zip(lookup.app_dir).and_then(|(id, app_dir)| orca::terminal_handle_for(app_dir, id));
    if let Some(handle) = found("hook-orca", record, log) {
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

/// For a Codex session with no process to follow that was started in the desktop app: the app's
/// executable name while one of its windows is open. Otherwise an editor showing the same folder
/// would win the title and folder match over the app that really shows the session.
fn codex_desktop_app(lookup: &Lookup, chain: &[u32]) -> Option<String> {
    if !lookup.is_codex || !chain.is_empty() {
        return None;
    }
    let home_dir = windows_home_dir().ok()?;
    if !codex_process::started_in_desktop_app(&home_dir, lookup.session_id?) {
        return None;
    }
    codex_process::CODEX_DESKTOP_APPS
        .iter()
        .find(|app| window_focus::open_app_exe(app).is_some())
        .map(|app| app.to_string())
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
    let record = session_id.zip(app_dir).and_then(|(id, dir)| session_records::read(dir, id));
    if record.is_some() {
        log.note("record=yes");
    }
    let chain = process_chain(is_codex, session_id, cwd, record.as_ref(), seen.as_ref(), &mut log);
    let lookup = Lookup { app_dir, record: record.as_ref(), is_codex, session_id, cwd, title };
    let handle = orca_handle(&lookup, &chain, seen.as_ref(), &mut log);

    // With no process to follow, the program the session was last seen in is the best guess.
    let remembered_app = seen.as_ref().and_then(|seen| seen.host_exe.as_deref()).map(app_name);
    let prefer_app = if handle.is_some() {
        Some(orca::ORCA_APP.to_string())
    } else {
        remembered_app.or_else(|| codex_desktop_app(&lookup, &chain))
    };
    if let Some(app) = &prefer_app {
        log.note(format!("prefer={app}"));
    }
    let (folder, ancestors) = cwd.map(folder_names).unwrap_or_default();
    let hints = SessionHints { folder: folder.as_deref(), ancestors: &ancestors, title, is_codex };
    let mut wezterm_tab = false;
    let focused = window_focus::focus_session_window(&hints, &chain, prefer_app.as_deref()).or_else(|| {
        // No process chain and no window titled so: the session may sit in a background WezTerm
        // tab. Bring that tab forward, after which its window carries the title.
        wezterm_tab = wezterm::activate_tab_titled(None, title?);
        wezterm_tab.then(|| window_focus::focus_session_window(&hints, &chain, Some(WEZTERM_APP)))?
    });
    if wezterm_tab {
        log.note("wezterm-tab=selected");
    }
    let Some(focused) = focused else {
        log.finish(app_dir, "not found");
        return false;
    };
    log.note(format!("window={}", focused.app));
    if let Some(handle) = handle.filter(|_| focused.app == orca::ORCA_APP) {
        let switched = win32::process::image_path(focused.process_id)
            .is_some_and(|orca_exe| orca::switch_terminal(Path::new(&orca_exe), &handle));
        log.note(if switched { "switch=sent" } else { "switch=failed" });
    }
    if let Some(title) = title.filter(|_| focused.app == WEZTERM_APP && !wezterm_tab) {
        let exe = win32::process::image_path(focused.process_id);
        let selected = wezterm::activate_tab_titled(exe.as_deref().map(Path::new), title);
        log.note(if selected { "wezterm-tab=selected" } else { "wezterm-tab=none" });
    }
    if let Some(title) = title.filter(|_| focused.app == WINDOWS_TERMINAL_APP) {
        let selected = window_focus::select_terminal_tab(&focused, title);
        log.note(if selected { "wt-tab=selected" } else { "wt-tab=none" });
    }
    // The link goes to the editor window used last, so only once the session's window is in front.
    if let (true, Ok(home_dir)) = (focused.in_front, windows_home_dir()) {
        let shown = editor_terminal::show_session_terminal(&home_dir, &focused.app, &chain, title);
        match shown {
            Some(EditorTerminal::Sent) => log.note("editor-terminal=sent"),
            Some(EditorTerminal::NoExtension) => log.note("editor-terminal=no-extension"),
            Some(EditorTerminal::Failed) => log.note("editor-terminal=failed"),
            None => {}
        }
    }
    log.finish(app_dir, if focused.in_front { "focused" } else { "found, flashed (Windows kept it behind)" });
    true
}

/// A session asked about by `sessions_in_front`.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRef {
    provider: String,
    session_id: String,
}

/// Ids of the sessions whose window is the one in front: the foreground window belongs to the
/// session's process or one of its ancestors (the terminal or editor it runs in). A session whose
/// process is not known is never in front. Shell hosts such as Explorer, which can be ancestors of
/// anything, do not count.
pub(super) fn sessions_in_front(app_dir: Option<&Path>, sessions: &[SessionRef]) -> Vec<String> {
    let front = win32::process::window_process_id(win32::window::foreground_window());
    let front_app = win32::process::image_path(front).map(|path| app_name(&path));
    if front == 0 || front_app.is_none_or(|app| window_focus::NOT_SESSION_HOSTS.contains(&app.as_str())) {
        return Vec::new();
    }
    sessions
        .iter()
        .filter(|session| {
            let id = session.session_id.as_str();
            // Only to satisfy process_chain; never written to agent-focus.log.
            let mut log = Attempt::new(&session.provider, Some(id));
            let seen = session_memory::get(app_dir, id);
            let record = app_dir.and_then(|dir| session_records::read(dir, id));
            let is_codex = session.provider == "codex";
            process_chain(is_codex, Some(id), None, record.as_ref(), seen.as_ref(), &mut log).contains(&front)
        })
        .map(|session| session.session_id.clone())
        .collect()
}
