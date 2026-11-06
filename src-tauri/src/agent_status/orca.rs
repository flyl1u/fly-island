//! Orca (an agent workspace that runs many terminals in one window) support. Its window title is
//! always "Orca", so titles cannot tell sessions apart, but each terminal has a handle in
//! `ORCA_TERMINAL_HANDLE` and `orca terminal switch --terminal <handle>` brings that tab to the
//! front. Claude Code's SessionStart hook (focusd-agent-running.cmd ... session) saves its input,
//! which names the session, as `agent-terminals/<handle>.json` in the app data folder.

use std::{
    fs,
    os::windows::process::CommandExt,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, SystemTime},
};

use serde_json::Value;

use crate::system::CREATE_NO_WINDOW;

/// Folder in the app data folder with one file per Orca terminal; must match the hook script.
pub(super) const AGENT_TERMINALS_DIR_NAME: &str = "agent-terminals";
/// Executable name (lowercase, without `.exe`) of the Orca app.
pub(super) const ORCA_APP: &str = "orca";
/// Records older than this belong to terminals long gone; they are deleted when read.
const RECORD_MAX_AGE: Duration = Duration::from_secs(7 * 24 * 60 * 60);

/// Whether `handle` looks like an Orca terminal handle ("term_" and a UUID). Anything else is
/// never passed to the Orca CLI.
pub(super) fn is_terminal_handle(handle: &str) -> bool {
    handle
        .strip_prefix("term_")
        .is_some_and(|id| (1..=64).contains(&id.len()) && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-'))
}

/// The session a saved SessionStart hook input names.
pub(super) fn record_session_id(record: &str) -> Option<String> {
    let input: Value = serde_json::from_str(record.trim_start_matches('\u{feff}')).ok()?;
    input["session_id"]
        .as_str()
        .filter(|id| !id.is_empty())
        .map(str::to_string)
}

/// The handle of the Orca terminal that last started or resumed `session_id`, if any.
pub(super) fn terminal_handle_for(app_dir: &Path, session_id: &str) -> Option<String> {
    let entries = fs::read_dir(app_dir.join(AGENT_TERMINALS_DIR_NAME)).ok()?;
    let now = SystemTime::now();
    let mut best: Option<(SystemTime, String)> = None;
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(handle) = path
            .file_name()
            .and_then(|name| name.to_str())
            .and_then(|name| name.strip_suffix(".json"))
            .filter(|handle| is_terminal_handle(handle))
        else {
            continue;
        };
        let modified = entry.metadata().and_then(|metadata| metadata.modified()).unwrap_or(now);
        if now.duration_since(modified).is_ok_and(|age| age > RECORD_MAX_AGE) {
            let _ = fs::remove_file(&path);
            continue;
        }
        let matches = fs::read_to_string(&path)
            .ok()
            .and_then(|record| record_session_id(&record))
            .is_some_and(|id| id == session_id);
        if matches && best.as_ref().is_none_or(|(newest, _)| modified > *newest) {
            best = Some((modified, handle.to_string()));
        }
    }
    best.map(|(_, handle)| handle)
}

/// The Orca CLI that ships with the Orca app at `orca_exe` (`resources\bin\orca.exe`).
pub(super) fn cli_path(orca_exe: &Path) -> PathBuf {
    orca_exe
        .parent()
        .unwrap_or(Path::new(""))
        .join("resources")
        .join("bin")
        .join("orca.exe")
}

/// Asks Orca to bring the terminal tab `handle` to the front. Does not wait: the CLI takes a few
/// seconds to reach Orca, and the window is already in front by then. False when the CLI is
/// missing or the handle is not valid.
pub(super) fn switch_terminal(orca_exe: &Path, handle: &str) -> bool {
    let cli = cli_path(orca_exe);
    if !is_terminal_handle(handle) || !cli.is_file() {
        return false;
    }
    Command::new(cli)
        .args(["terminal", "switch", "--terminal", handle])
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .is_ok()
}
