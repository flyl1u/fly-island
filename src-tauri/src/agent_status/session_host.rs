//! Where an agent session runs (Orca, Windows Terminal, VS Code, the Codex app, ...), shown on the
//! island's Agent page. A running Claude Code session leads to its process (session_process.rs);
//! the nearest ancestor that owns a window is its host. A host stays known after the session ends
//! (session_memory.rs). Codex records its origin in the rollout instead.

use std::{
    collections::{HashMap, HashSet},
    path::Path,
};

use serde::Serialize;

use super::orca;
use super::session_memory::{self, SeenSession};
use super::session_process::{ancestor_chain, running_sessions};
use super::session_records;
use super::snapshot::current_unix_millis;
use super::sessions::AgentSessionSummary;
use super::window_focus::{app_name, NOT_SESSION_HOSTS};
use crate::win32;

/// The program an agent session runs in.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionHost {
    /// Product name, such as "Windows Terminal". Not translated.
    pub(super) name: String,
    /// Its executable, for the icon; `None` when unknown (Codex CLI and other origins).
    pub(super) exe: Option<String>,
    /// "terminal", "editor" or "app": the fallback icon when the executable has none.
    pub(super) kind: &'static str,
}

/// Known hosts by executable name (lowercase, no `.exe`): product name and kind.
const KNOWN_HOSTS: &[(&str, &str, &str)] = &[
    ("orca", "Orca", "terminal"),
    ("windowsterminal", "Windows Terminal", "terminal"),
    ("wezterm-gui", "WezTerm", "terminal"),
    ("alacritty", "Alacritty", "terminal"),
    ("warp", "Warp", "terminal"),
    ("tabby", "Tabby", "terminal"),
    ("hyper", "Hyper", "terminal"),
    ("conemu64", "ConEmu", "terminal"),
    ("mintty", "Git Bash", "terminal"),
    ("powershell", "Windows PowerShell", "terminal"),
    ("pwsh", "PowerShell", "terminal"),
    ("cmd", "cmd", "terminal"),
    ("code", "VS Code", "editor"),
    ("code - insiders", "VS Code Insiders", "editor"),
    ("vscodium", "VSCodium", "editor"),
    ("cursor", "Cursor", "editor"),
    ("windsurf", "Windsurf", "editor"),
    ("trae", "Trae", "editor"),
    ("kiro", "Kiro", "editor"),
    ("zed", "Zed", "editor"),
    ("idea64", "IntelliJ IDEA", "editor"),
    ("pycharm64", "PyCharm", "editor"),
    ("webstorm64", "WebStorm", "editor"),
    ("rustrover64", "RustRover", "editor"),
    ("codex", "Codex", "app"),
    // The Codex desktop app moved into the ChatGPT package; its executable is ChatGPT.exe.
    ("chatgpt", "Codex", "app"),
];

/// The host for an executable path: its known name, else the file name as is.
pub(super) fn host_for_exe(exe: &str) -> SessionHost {
    let app = app_name(exe);
    let (name, kind) = KNOWN_HOSTS
        .iter()
        .find(|(known, _, _)| *known == app)
        .map(|&(_, name, kind)| (name.to_string(), kind))
        .unwrap_or_else(|| {
            let stem = Path::new(exe)
                .file_stem()
                .map(|stem| stem.to_string_lossy().to_string())
                .unwrap_or(app);
            (stem, "app")
        });
    SessionHost { name, exe: Some(exe.to_string()), kind }
}

/// Where a Codex session started, from the `originator` of its rollout.
pub(super) fn codex_host(originator: &str) -> SessionHost {
    let (name, kind) = match originator {
        "Codex Desktop" => ("Codex", "app"),
        "codex_cli_rs" | "codex_exec" => ("Codex CLI", "terminal"),
        "codex_vscode" => ("VS Code", "editor"),
        other => (other, "app"),
    };
    SessionHost { name: name.to_string(), exe: None, kind }
}

/// The host of the nearest process in `chain` that owns a window; `windows` maps a process id to
/// its executable for every process with a visible top-level window.
pub(super) fn host_of_chain(chain: &[u32], windows: &HashMap<u32, String>) -> Option<String> {
    chain.iter().find_map(|pid| {
        windows
            .get(pid)
            .filter(|exe| !NOT_SESSION_HOSTS.contains(&app_name(exe).as_str()))
            .cloned()
    })
}

/// The host named by the environment the session inherited from its terminal or editor, for when
/// the parent chain breaks: Git Bash's fork and exec (as when Happy starts the session) leave a
/// parent process that has already exited. `var` reads the session's variable, `open` gives the
/// executable of an open window of an app.
pub(super) fn host_from_env(
    var: impl Fn(&str) -> Option<String>,
    open: impl Fn(&str) -> Option<String>,
) -> Option<String> {
    let var = |name: &str| var(name).filter(|value| !value.is_empty());
    // TERM_PROGRAM is the innermost terminal's; the others leak into programs started from it.
    match var("TERM_PROGRAM").map(|program| program.to_lowercase()).as_deref() {
        Some("wezterm") => var("WEZTERM_EXECUTABLE").or_else(|| open("wezterm-gui")),
        // VS Code and editors built on it point Git's askpass at their own executable.
        Some("vscode") => var("VSCODE_GIT_ASKPASS_NODE").or_else(|| open("code")),
        Some("mintty") => open("mintty"),
        _ if var("WT_SESSION").is_some() => open("windowsterminal"),
        _ => None,
    }
}

/// A session without a host is looked at again after this long (its window may not exist yet).
const HOST_RETRY_MS: i64 = 30_000;

/// Works out, for each running session not seen yet (or now in another process), its process,
/// host program and Orca terminal, and remembers them (session_memory.rs) so they outlive the
/// session. The process comes from the session's SessionStart record (session_records.rs, Claude
/// Code and Codex), else Claude Code's registry. Then fills in `host` for the listed sessions; a
/// Codex session found this way shows its real program instead of the origin in its rollout.
/// Windows are only enumerated when such a session exists.
pub(super) fn attach_hosts(home_dir: &Path, app_dir: Option<&Path>, sessions: &mut [AgentSessionSummary]) {
    let now = current_unix_millis();
    let running = running_sessions(home_dir);
    let record = |id: &str| app_dir.and_then(|dir| session_records::read(dir, id));
    let unknown: Vec<(String, u32, Option<String>)> = sessions
        .iter()
        .filter_map(|session| {
            let recorded = record(&session.session_id);
            let pid = recorded.as_ref().and_then(|recorded| recorded.live_pid()).or_else(|| {
                (session.provider == "claudeCode").then(|| running.get(&session.session_id).copied()).flatten()
            })?;
            let tab = recorded.and_then(|recorded| recorded.orca_handle());
            Some((session.session_id.clone(), pid, tab))
        })
        .filter(|(id, pid, _)| {
            session_memory::get(app_dir, id).is_none_or(|seen| {
                seen.pid != *pid || (seen.host_exe.is_none() && now - seen.seen_at > HOST_RETRY_MS)
            })
        })
        .collect();
    if !unknown.is_empty() {
        let windows = window_owners();
        let parents = win32::process_tree::parent_process_ids();
        for (id, pid, recorded_tab) in unknown {
            let chain = ancestor_chain(pid, &parents, win32::process_times::start_time);
            let seen = SeenSession {
                pid,
                started: win32::process_times::start_time(pid),
                host_exe: host_of_chain(&chain, &windows).or_else(|| {
                    let var = |name: &str| win32::process_env::environment_variable(pid, name);
                    host_from_env(var, |app| windows.values().find(|exe| app_name(exe) == app).cloned())
                }),
                orca_handle: orca::terminal_handle_of_process(pid).or(recorded_tab),
                seen_at: now,
            };
            session_memory::remember(app_dir, &id, seen);
        }
    }

    for session in sessions.iter_mut() {
        let seen = session_memory::get(app_dir, &session.session_id).and_then(|seen| seen.host_exe);
        if let Some(exe) = seen {
            session.host = Some(host_for_exe(&exe));
        }
    }
}

/// Process id -> executable path, for every process with a visible, unowned, titled window.
fn window_owners() -> HashMap<u32, String> {
    let mut owners = HashSet::new();
    let _ = win32::window::for_each_top_level_window(|window| {
        if win32::window::is_visible(window)
            && !win32::window::has_owner(window)
            && !win32::window::window_text(window, 2).is_empty()
        {
            owners.insert(win32::process::window_process_id(window));
        }
    });
    owners
        .into_iter()
        .filter_map(|pid| win32::process::image_path(pid).map(|exe| (pid, exe)))
        .collect()
}
