//! WezTerm tabs. WezTerm draws its own tabs and its window title is only the active tab's, so a
//! session in a background tab cannot be found by title, and a session started outside WezTerm's
//! process tree (by Happy, say) has no process chain to it either. `wezterm cli list` names every
//! pane with the title Claude Code set; `wezterm cli activate-pane` brings one forward, after
//! which its window carries the session's title.

use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Deserialize;

use super::title::only_tab_titled;
use crate::system::CREATE_NO_WINDOW;
use crate::win32;

pub(super) const WEZTERM_APP: &str = "wezterm-gui";
const GUI_EXE: &str = "wezterm-gui.exe";
const CLI_EXE: &str = "wezterm.exe";

#[derive(Debug, Deserialize)]
struct Pane {
    pane_id: u64,
    title: String,
}

/// The `wezterm` command beside the running WezTerm, or beside `gui_exe` when given.
fn cli_beside(gui_exe: Option<&Path>) -> Option<PathBuf> {
    let gui = match gui_exe {
        Some(path) => path.to_path_buf(),
        None => PathBuf::from(win32::process::running_executable(&[GUI_EXE])?),
    };
    let cli = gui.with_file_name(CLI_EXE);
    cli.is_file().then_some(cli)
}

fn run(cli: &Path, args: &[&str]) -> Option<Vec<u8>> {
    let output = Command::new(cli).args(args).creation_flags(CREATE_NO_WINDOW).output().ok()?;
    output.status.success().then_some(output.stdout)
}

/// The id of the only pane whose title shows the session titled `title`.
fn pane_titled(list: &[u8], title: &str) -> Option<u64> {
    let panes: Vec<Pane> = serde_json::from_slice(list).ok()?;
    let titles: Vec<String> = panes.iter().map(|pane| pane.title.clone()).collect();
    only_tab_titled(&titles, title).map(|index| panes[index].pane_id)
}

/// Brings forward the WezTerm tab showing the session titled `title`, in the WezTerm at `gui_exe`
/// or else any running one. False when WezTerm is not running or no single tab shows the title.
pub(super) fn activate_tab_titled(gui_exe: Option<&Path>, title: &str) -> bool {
    let Some(cli) = cli_beside(gui_exe) else {
        return false;
    };
    let Some(pane) = run(&cli, &["cli", "list", "--format", "json"]).and_then(|list| pane_titled(&list, title)) else {
        return false;
    };
    run(&cli, &["cli", "activate-pane", "--pane-id", &pane.to_string()]).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_pane_is_found_by_the_title_claude_code_set() {
        let list = br#"[
            {"window_id":0,"tab_id":0,"pane_id":0,"title":"\u25d1 Flyisland \u4e0a\u6e38\u4ed3\u5e93","cwd":"file:///F:/x"},
            {"window_id":0,"tab_id":1,"pane_id":4,"title":"\u2733 T7 shield sync","cwd":"file:///F:/y"},
            {"window_id":0,"tab_id":2,"pane_id":5,"title":"scg6928@ln2: ~","cwd":""}
        ]"#;
        assert_eq!(pane_titled(list, "Flyisland 上游仓库"), Some(0));
        assert_eq!(pane_titled(list, "T7 shield sync"), Some(4));
        assert_eq!(pane_titled(list, "something else"), None);
        assert_eq!(pane_titled(b"not json", "T7 shield sync"), None);
    }
}
