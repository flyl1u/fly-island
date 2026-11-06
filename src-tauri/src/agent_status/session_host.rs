//! Where an agent session runs (Orca, Windows Terminal, VS Code, the Codex app, ...), shown on the
//! island's Agent page. A running Claude Code session leads to its process (session_process.rs);
//! the nearest ancestor that owns a window is its host. A host stays known after the session ends,
//! for as long as the island runs. Codex records its origin in the rollout instead.

use std::{
    collections::{HashMap, HashSet},
    path::Path,
    sync::{Mutex, PoisonError},
};

use serde::Serialize;

use super::session_process::{ancestor_chain, running_sessions};
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

/// Hosts found so far: session id -> (its process id, host). Kept after a session ends.
static HOSTS: Mutex<Option<HashMap<String, (u32, SessionHost)>>> = Mutex::new(None);
/// Sessions remembered at most; old ones are dropped as a whole past this.
const MAX_REMEMBERED: usize = 256;

/// Fills in `host` for the listed sessions. Codex sessions already carry theirs. Windows are
/// only enumerated when a running Claude Code session has no known host yet.
pub(super) fn attach_hosts(home_dir: &Path, sessions: &mut [AgentSessionSummary]) {
    let mut guard = HOSTS.lock().unwrap_or_else(PoisonError::into_inner);
    let hosts = guard.get_or_insert_with(HashMap::new);
    let running = running_sessions(home_dir);

    let unknown: Vec<(&String, u32)> = sessions
        .iter()
        .filter(|session| session.provider == "claudeCode")
        .filter_map(|session| running.get_key_value(&session.session_id))
        .filter(|(id, pid)| hosts.get(*id).is_none_or(|(known, _)| known != *pid))
        .map(|(id, pid)| (id, *pid))
        .collect();
    if !unknown.is_empty() {
        let windows = window_owners();
        let parents = win32::process_tree::parent_process_ids();
        if hosts.len() > MAX_REMEMBERED {
            hosts.clear();
        }
        for (id, pid) in unknown {
            let chain = ancestor_chain(pid, &parents, win32::process_times::start_time);
            if let Some(exe) = host_of_chain(&chain, &windows) {
                hosts.insert(id.clone(), (pid, host_for_exe(&exe)));
            }
        }
    }

    for session in sessions.iter_mut().filter(|session| session.host.is_none()) {
        session.host = hosts.get(&session.session_id).map(|(_, host)| host.clone());
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
