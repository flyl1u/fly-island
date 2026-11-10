//! Where a Codex session runs when its SessionStart hook left no record: hooks that never ran
//! (not trusted yet, or the desktop app's sandbox) leave Codex with no process to follow, unlike
//! Claude Code, whose own registry still names its process. Two fallbacks: a session started in
//! the desktop app (the rollout's `originator`) belongs to the app's window, and a Codex CLI
//! process whose working folder is the session's folder is the session's process.

use std::{
    fs::{self, File},
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
};

use super::session_records::is_session_id;
use super::sessions::codex_originator;
use crate::win32;

/// Executables of the Codex desktop app (lowercase, no `.exe`): `ChatGPT.exe` since the app moved
/// into the ChatGPT package (still `OpenAI.Codex`), `Codex.exe` before that.
pub(super) const CODEX_DESKTOP_APPS: &[&str] = &["chatgpt", "codex"];

/// The rollout's `originator` for sessions started in the desktop app.
const DESKTOP_ORIGINATOR: &str = "Codex Desktop";

/// The Codex CLI's own process (the npm package starts this native binary under node).
const CODEX_CLI_EXE: &str = "codex.exe";

/// Day folders searched for a rollout, newest first; the Agent page lists a day at most.
const MAX_DAY_DIRS: usize = 14;

fn sorted_dirs_newest_first(dir: &Path) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = fs::read_dir(dir)
        .map(|entries| entries.flatten().map(|entry| entry.path()).filter(|path| path.is_dir()).collect())
        .unwrap_or_default();
    // Year, month and day folders are zero-padded numbers, so names sort by date.
    dirs.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
    dirs
}

/// The rollout of `session_id`: `~/.codex/sessions/<year>/<month>/<day>/rollout-<time>-<id>.jsonl`.
pub(super) fn rollout_path(home_dir: &Path, session_id: &str) -> Option<PathBuf> {
    if !is_session_id(session_id) {
        return None;
    }
    let suffix = format!("-{session_id}.jsonl");
    // A long thread continues in pages: `rollout-<time>-<thread>_<page>.jsonl`.
    let page = format!("-{session_id}_");
    sorted_dirs_newest_first(&home_dir.join(".codex").join("sessions"))
        .iter()
        .flat_map(|year| sorted_dirs_newest_first(year))
        .flat_map(|month| sorted_dirs_newest_first(&month))
        .take(MAX_DAY_DIRS)
        .find_map(|day| {
            fs::read_dir(day).ok()?.flatten().map(|entry| entry.path()).find(|path| {
                path.file_name().is_some_and(|name| {
                    let name = name.to_string_lossy();
                    name.ends_with(&suffix) || (name.contains(&page) && name.ends_with(".jsonl"))
                })
            })
        })
}

/// Whether the session was started in the Codex desktop app, from the first line of its rollout.
pub(super) fn started_in_desktop_app(home_dir: &Path, session_id: &str) -> bool {
    let Some(path) = rollout_path(home_dir, session_id) else {
        return false;
    };
    let mut first_line = String::new();
    let read = File::open(path).ok().map(BufReader::new).and_then(|mut reader| reader.read_line(&mut first_line).ok());
    read.is_some() && codex_originator(&first_line).as_deref() == Some(DESKTOP_ORIGINATOR)
}

/// Whether two Windows folder paths name the same folder: case and a trailing separator aside.
pub(super) fn same_folder(a: &str, b: &str) -> bool {
    let normalize = |path: &str| path.trim().trim_end_matches(['\\', '/']).replace('/', "\\").to_lowercase();
    let (a, b) = (normalize(a), normalize(b));
    !a.is_empty() && a == b
}

/// The only one of `candidates` (process id, working folder) working in `cwd`; `None` when none
/// or several do, so two sessions in one folder are never confused.
pub(super) fn only_process_in(candidates: &[(u32, String)], cwd: &str) -> Option<u32> {
    let mut matching = candidates.iter().filter(|(_, folder)| same_folder(folder, cwd));
    let (pid, _) = matching.next()?;
    matching.next().is_none().then_some(*pid)
}

/// The running Codex CLI process working in the session's folder, if exactly one does.
pub(super) fn cli_process_in(cwd: &str) -> Option<u32> {
    let candidates: Vec<(u32, String)> = win32::process_tree::process_ids_named(CODEX_CLI_EXE)
        .into_iter()
        .filter_map(|pid| win32::process_env::current_directory(pid).map(|folder| (pid, folder)))
        .collect();
    only_process_in(&candidates, cwd)
}
