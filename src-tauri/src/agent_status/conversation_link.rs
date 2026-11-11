//! Opening the exact conversation of a session, not only the app it runs in, through the link the
//! app itself handles. Once the session's window is found (focus.rs), the island opens:
//!
//! - Claude desktop (the Code tab): `claude://code/continue?session=local_<id>`. The app takes only
//!   its own session id, kept in `claude-code-sessions/<account>/<org>/local_<id>.json` next to the
//!   Claude Code session id (`cliSessionId`) the island knows.
//! - The Codex desktop app: `codex://threads/<thread id>`, the link its "Copy link" gives.
//! - Claude Code's editor extension (VS Code, Cursor, ...): `<scheme>://anthropic.claude-code/open?session=<id>`.
//! - Codex's editor extension (`openai.chatgpt`): `<scheme>://openai.chatgpt/local/<thread id>`.
//!
//! Editor links only for sessions started in the extension, and only while that extension is
//! installed (otherwise the editor offers to install it). Sessions in a terminal have no link:
//! their tab is selected instead (window_focus.rs, editor_terminal.rs).

use std::{
    env,
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
};

use serde_json::Value;

use super::codex_process::{self, CODEX_DESKTOP_APPS};
use super::editor_terminal::{editor_of_app, extension_installed_with};
use super::session_records::is_session_id;
use super::sessions::codex_originator;
use super::usage::claude_dir;

/// Claude desktop's executable name.
const CLAUDE_DESKTOP_APP: &str = "claude";
/// Claude Code's `entrypoint` for sessions started in its editor extension.
const CLAUDE_EXTENSION_ENTRYPOINT: &str = "claude-vscode";
const CLAUDE_EXTENSION_ID: &str = "anthropic.claude-code";
/// Codex's `originator` for sessions started in its editor extension.
const CODEX_EXTENSION_ORIGINATOR: &str = "codex_vscode";
const CODEX_EXTENSION_ID: &str = "openai.chatgpt";
/// Transcripts are read this far from the end for their `entrypoint`.
const TAIL_BYTES: u64 = 64 * 1024;
/// A Claude desktop session file is a few dozen KiB; anything far larger is not one.
const MAX_SESSION_FILE_BYTES: u64 = 1024 * 1024;

/// The link that opens the session's conversation in `app` (the executable name of the window
/// brought forward); `None` when that app has no such link or the session is not one of its own.
pub(super) fn conversation_link(home_dir: &Path, app: &str, provider: &str, session_id: &str) -> Option<String> {
    if !is_session_id(session_id) {
        return None;
    }
    let is_codex = provider == "codex";
    if app == CLAUDE_DESKTOP_APP && !is_codex {
        let local_id = claude_desktop_roots().iter().find_map(|root| desktop_session_id(root, session_id))?;
        return Some(format!("claude://code/continue?session={local_id}"));
    }
    if CODEX_DESKTOP_APPS.contains(&app) && is_codex {
        return Some(format!("codex://threads/{session_id}"));
    }
    let (scheme, folder) = editor_of_app(app)?;
    let extensions = home_dir.join(folder).join("extensions");
    if is_codex {
        let rollout = codex_process::rollout_path(home_dir, session_id)?;
        let started_in_extension = first_line(&rollout).and_then(|line| codex_originator(&line)).as_deref() == Some(CODEX_EXTENSION_ORIGINATOR);
        (started_in_extension && extension_installed_with(&extensions, CODEX_EXTENSION_ID))
            .then(|| format!("{scheme}://{CODEX_EXTENSION_ID}/local/{session_id}"))
    } else {
        let started_in_extension = claude_entrypoint(&claude_dir(home_dir), session_id).as_deref() == Some(CLAUDE_EXTENSION_ENTRYPOINT);
        (started_in_extension && extension_installed_with(&extensions, CLAUDE_EXTENSION_ID))
            .then(|| format!("{scheme}://{CLAUDE_EXTENSION_ID}/open?session={session_id}"))
    }
}

/// Whether `link` opens a conversation in an editor extension, where the session has no terminal.
pub(super) fn is_extension_link(link: &str) -> bool {
    link.contains(&format!("://{CLAUDE_EXTENSION_ID}/")) || link.contains(&format!("://{CODEX_EXTENSION_ID}/"))
}

/// Folders Claude desktop may keep its data in: `%APPDATA%\Claude` for the installer build;
/// the Store build's `%LOCALAPPDATA%\Claude-Data\<package>` or its virtualized `%APPDATA%`.
pub(super) fn claude_desktop_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(roaming) = env::var_os("APPDATA").map(PathBuf::from) {
        roots.push(roaming.join("Claude"));
    }
    if let Some(local) = env::var_os("LOCALAPPDATA").map(PathBuf::from) {
        roots.extend(dir_entries(&local.join("Claude-Data")));
        roots.extend(
            dir_entries(&local.join("Packages"))
                .into_iter()
                .filter(|package| package.file_name().is_some_and(|name| name.to_string_lossy().starts_with("Claude_")))
                .map(|package| package.join("LocalCache").join("Roaming").join("Claude")),
        );
    }
    roots
}

fn dir_entries(dir: &Path) -> Vec<PathBuf> {
    fs::read_dir(dir).map(|entries| entries.flatten().map(|entry| entry.path()).collect()).unwrap_or_default()
}

/// Claude desktop's own id (`local_<uuid>`) for the Claude Code session `cli_session_id`, from the
/// session files under `root`. Archived sessions are left out: the app does not open them by link.
/// A session resumed under a new Claude Code id is found by its latest one too.
pub(super) fn desktop_session_id(root: &Path, cli_session_id: &str) -> Option<String> {
    let mut best: Option<(i64, String)> = None;
    for account in dir_entries(&root.join("claude-code-sessions")) {
        for org in dir_entries(&account) {
            for path in dir_entries(&org) {
                let name = path.file_name().map(|name| name.to_string_lossy().to_string()).unwrap_or_default();
                if !name.starts_with("local_") || !name.ends_with(".json") {
                    continue;
                }
                let Some(session) = read_json(&path) else { continue };
                let matches = ["cliSessionId", "lastAssistantCliSessionId"]
                    .iter()
                    .any(|key| session[*key].as_str() == Some(cli_session_id));
                let local_id = session["sessionId"].as_str().filter(|id| is_desktop_session_id(id));
                if let (true, false, Some(local_id)) = (matches, session["isArchived"] == true, local_id) {
                    let active = session["lastActivityAt"].as_i64().unwrap_or(0);
                    if best.as_ref().is_none_or(|(best_active, _)| active > *best_active) {
                        best = Some((active, local_id.to_string()));
                    }
                }
            }
        }
    }
    best.map(|(_, id)| id)
}

/// The form Claude desktop accepts in its link: `local_` and up to 64 letters, digits or dashes.
fn is_desktop_session_id(id: &str) -> bool {
    id.strip_prefix("local_")
        .is_some_and(|rest| (1..=64).contains(&rest.len()) && rest.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'))
}

fn read_json(path: &Path) -> Option<Value> {
    let mut text = String::new();
    File::open(path).ok()?.take(MAX_SESSION_FILE_BYTES).read_to_string(&mut text).ok()?;
    serde_json::from_str(&text).ok()
}

fn first_line(path: &Path) -> Option<String> {
    let mut text = String::new();
    File::open(path).ok()?.take(64 * 1024).read_to_string(&mut text).ok();
    text.lines().next().map(str::to_string)
}

/// Where a Claude Code session was started (`cli`, `claude-vscode`, `claude-desktop`, ...), from
/// the newest record of its transcript `<claude dir>/projects/<project>/<id>.jsonl` that says.
pub(super) fn claude_entrypoint(claude_dir: &Path, session_id: &str) -> Option<String> {
    let file_name = format!("{session_id}.jsonl");
    let path = dir_entries(&claude_dir.join("projects"))
        .into_iter()
        .map(|project| project.join(&file_name))
        .find(|path| path.is_file())?;
    let mut file = File::open(path).ok()?;
    let start = file.metadata().ok()?.len().saturating_sub(TAIL_BYTES);
    file.seek(SeekFrom::Start(start)).ok()?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).ok()?;
    String::from_utf8_lossy(&bytes).lines().rev().find_map(|line| {
        if !line.contains("\"entrypoint\"") {
            return None;
        }
        serde_json::from_str::<Value>(line).ok()?["entrypoint"].as_str().map(str::to_string)
    })
}
