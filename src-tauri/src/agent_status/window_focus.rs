//! Brings the editor or terminal window running an agent session to the front. A running Claude
//! Code session leads to its process, and its nearest ancestor with a window is the one (see
//! session_process.rs). Otherwise windows are matched by title: VS Code-style editors show the
//! project folder ("file - fly-island - Visual Studio Code"), and Windows Terminal shows the title
//! Claude Code sets for the session ("✳ 设置界面完善思路").

use std::path::Path;

use windows::Win32::Foundation::HWND;

use super::codex_process::CODEX_DESKTOP_APPS;
use super::title::terminal_tab_for;
use crate::win32;

/// Editors whose window title names the open folder. Lowercase executable names without `.exe`.
const EDITORS: &[&str] = &[
    "code",
    "code - insiders",
    "cursor",
    "windsurf",
    "trae",
    "kiro",
    "vscodium",
];
/// Terminals whose window title follows the running program (Claude Code sets it to the session).
const TERMINALS: &[&str] = &[
    "windowsterminal",
    "wezterm-gui",
    "alacritty",
    "warp",
    "tabby",
    "conemu64",
    "mintty",
    "powershell",
    "pwsh",
    "cmd",
];

/// Window titles are rarely longer; longer ones are cut, which only loses their end.
const WINDOW_TITLE_UNITS: usize = 512;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct WindowCandidate {
    pub(super) title: String,
    /// Executable file name without extension, lowercase.
    pub(super) app: String,
}

/// What is known about the session to find: its folder name, its title and the agent.
#[derive(Debug, Default)]
pub(super) struct SessionHints<'a> {
    pub(super) folder: Option<&'a str>,
    /// Names of the folders above `folder`, nearest first: an editor may have one of them open
    /// (the repository) while the session runs in a subfolder or a worktree below it.
    pub(super) ancestors: &'a [String],
    pub(super) title: Option<&'a str>,
    pub(super) is_codex: bool,
}

/// Index of the best match among windows given in z-order (front first), or `None`.
pub(super) fn best_window(candidates: &[WindowCandidate], hints: &SessionHints) -> Option<usize> {
    let folder = hints
        .folder
        .map(str::to_lowercase)
        .filter(|folder| !folder.is_empty());
    // Titles shown on the island may be cut with an ellipsis; match on what is left.
    let title = hints
        .title
        .map(|title| title.trim_end_matches('…').trim().to_lowercase())
        .filter(|title| title.chars().count() >= 2);

    let score = |candidate: &WindowCandidate| {
        let window_title = candidate.title.to_lowercase();
        let is_editor = EDITORS.contains(&candidate.app.as_str());
        let is_terminal = TERMINALS.contains(&candidate.app.as_str());
        let has_title = title
            .as_ref()
            .is_some_and(|title| window_title.contains(title));
        let has_folder = |matches: fn(&str, &str) -> bool| {
            folder
                .as_ref()
                .is_some_and(|folder| matches(&window_title, folder))
        };
        let has_ancestor = || {
            hints
                .ancestors
                .iter()
                .any(|ancestor| segment_names_folder(&window_title, &ancestor.to_lowercase()))
        };
        match () {
            _ if (is_editor || is_terminal) && has_title => 4,
            _ if is_editor && has_folder(segment_names_folder) => 3,
            _ if is_terminal && has_folder(path_names_folder) => 2,
            _ if is_editor && has_ancestor() => 2,
            // Codex's own desktop app, the last resort for Codex sessions started there.
            _ if hints.is_codex && CODEX_DESKTOP_APPS.contains(&candidate.app.as_str()) => 1,
            _ => 0,
        }
    };

    let mut best: Option<(usize, u8)> = None;
    for (index, candidate) in candidates.iter().enumerate() {
        let candidate_score = score(candidate);
        if candidate_score > best.map_or(0, |(_, score)| score) {
            best = Some((index, candidate_score));
        }
    }
    best.map(|(index, _)| index)
}

/// Editors: `folder` is one of the " - "-separated segments ("file - fly-island - Visual Studio
/// Code"). Whole segments only, so a folder named "code" does not match every editor window.
/// Markers editors add around a name: unsaved files ("● main.rs"), multi-root workspaces
/// ("app (Workspace)", "app (工作区)") and elevated windows ("[Administrator]", "[管理员]").
pub(super) fn bare_segment(segment: &str) -> &str {
    let mut text = segment.trim().trim_start_matches(['●', '•', '*']).trim();
    for marker in [" (workspace)", " (工作区)", " [administrator]", " [管理员]"] {
        text = text.strip_suffix(marker).unwrap_or(text).trim();
    }
    text
}

fn segment_names_folder(window_title: &str, folder: &str) -> bool {
    window_title
        .split(" - ")
        .flat_map(|segment| segment.split(" — "))
        .any(|segment| bare_segment(segment) == folder)
}

/// Terminals: `folder` is a whole path component or word ("PS E:\Projects\fly-island>").
fn path_names_folder(window_title: &str, folder: &str) -> bool {
    window_title
        .split([' ', '\\', '/'])
        .any(|part| part.trim_matches([':', '>', '-', '—']) == folder)
        || segment_names_folder(window_title, folder)
}

/// Lowercase executable name without extension from a full image path.
pub(super) fn app_name(image_path: &str) -> String {
    Path::new(image_path)
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

/// Programs whose windows are never a session's: the shell hosts everything started from the
/// Start menu or Explorer, so the parent chain can reach it.
pub(super) const NOT_SESSION_HOSTS: &[&str] = &["explorer", "sihost", "svchost", "services", "winlogon"];

/// Index of the window that shows a session, found from its process chain (`chain`: the session's
/// process, then its ancestors). The nearest ancestor that owns a window wins; when it owns
/// several (an editor with many folders open), the title or folder picks one, else the frontmost.
/// `owners[i]` is the process id of `candidates[i]`.
pub(super) fn window_of_process_chain(
    candidates: &[WindowCandidate],
    owners: &[u32],
    chain: &[u32],
    hints: &SessionHints,
) -> Option<usize> {
    chain.iter().find_map(|pid| {
        let owned: Vec<usize> = (0..candidates.len())
            .filter(|&index| owners.get(index) == Some(pid))
            .filter(|&index| !NOT_SESSION_HOSTS.contains(&candidates[index].app.as_str()))
            .collect();
        let first = *owned.first()?;
        let subset: Vec<WindowCandidate> = owned.iter().map(|&index| candidates[index].clone()).collect();
        Some(best_window(&subset, hints).map_or(first, |index| owned[index]))
    })
}

/// The executable of a visible window of `app` (lowercase, no ".exe"), if that program is open.
pub(super) fn open_app_exe(app: &str) -> Option<String> {
    let mut found = None;
    let _ = win32::window::for_each_top_level_window(|window| {
        if found.is_some() || !win32::window::is_visible(window) || win32::window::has_owner(window) {
            return;
        }
        let process_id = win32::process::window_process_id(window);
        if let Some(path) = win32::process::image_path(process_id).filter(|path| app_name(path) == app) {
            found = Some(path);
        }
    });
    found
}

/// The window found for a session: the process that owns it, its executable name, and whether
/// Windows let it come to the front (otherwise its taskbar button flashes).
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct FocusedWindow {
    pub(super) window: HWND,
    pub(super) process_id: u32,
    pub(super) app: String,
    pub(super) in_front: bool,
}

/// Finds the window for the session and brings it to the front: first from the session's process
/// chain, then a window of `prefer_app` (the program the session was last seen in, or Orca when
/// its terminal is known), then by title and folder. `None` when nothing matched.
pub(super) fn focus_session_window(
    hints: &SessionHints,
    chain: &[u32],
    prefer_app: Option<&str>,
) -> Option<FocusedWindow> {
    let mut windows = Vec::new();
    let mut candidates = Vec::new();
    let enumerated = win32::window::for_each_top_level_window(|window| {
        if !win32::window::is_visible(window) || win32::window::has_owner(window) {
            return;
        }
        let title = win32::window::window_text(window, WINDOW_TITLE_UNITS);
        if title.is_empty() {
            return;
        }
        let process_id = win32::process::window_process_id(window);
        let Some(path) = win32::process::image_path(process_id) else {
            return;
        };
        windows.push((window, process_id));
        candidates.push(WindowCandidate {
            title,
            app: app_name(&path),
        });
    });
    if enumerated.is_err() {
        return None;
    }

    let owners: Vec<u32> = windows.iter().map(|&(_, process_id)| process_id).collect();
    let index = window_of_process_chain(&candidates, &owners, chain, hints)
        .or_else(|| {
            let app = prefer_app?;
            let preferred: Vec<usize> = (0..candidates.len()).filter(|&i| candidates[i].app == app).collect();
            let subset: Vec<WindowCandidate> = preferred.iter().map(|&i| candidates[i].clone()).collect();
            // Several windows of that program: let the folder or title pick, else the frontmost.
            best_window(&subset, hints).map(|i| preferred[i]).or_else(|| preferred.first().copied())
        })
        .or_else(|| best_window(&candidates, hints))?;
    let &(window, process_id) = windows.get(index)?;
    win32::window::allow_set_foreground_window(process_id);
    let in_front = win32::window::force_foreground(window);
    if !in_front {
        win32::window::flash(window);
    }
    Some(FocusedWindow {
        window,
        process_id,
        app: candidates[index].app.clone(),
        in_front,
    })
}

/// Selects the Windows Terminal tab showing the session (title.rs `terminal_tab_for`): in the
/// window already brought forward, else in another window of the same Windows Terminal process,
/// which is then brought forward instead.
pub(super) fn select_terminal_tab(focused: &FocusedWindow, title: Option<&str>, folder: Option<&str>) -> bool {
    let choose = |tabs: &[String]| terminal_tab_for(tabs, title, folder);
    if win32::uia_tabs::select_tab(focused.window, choose) {
        return true;
    }
    let mut others = Vec::new();
    let _ = win32::window::for_each_top_level_window(|window| {
        if window != focused.window
            && win32::window::is_visible(window)
            && !win32::window::has_owner(window)
            && win32::process::window_process_id(window) == focused.process_id
        {
            others.push(window);
        }
    });
    let Some(window) = others.into_iter().find(|&window| win32::uia_tabs::select_tab(window, choose)) else {
        return false;
    };
    win32::window::allow_set_foreground_window(focused.process_id);
    if !win32::window::force_foreground(window) {
        win32::window::flash(window);
    }
    true
}
