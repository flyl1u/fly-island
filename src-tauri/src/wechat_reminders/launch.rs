//! Brings WeChat to the front, or starts it, without ever triggering a Windows
//! "application not found" dialog.
//!
//! Order: activate a visible main window directly; otherwise start the running
//! instance's own executable again (WeChat is single-instance and restores its
//! hidden UI itself); only then, and only when it is registered, the `weixin://`
//! protocol. Weixin 4.x and some installs do not register that protocol, and the
//! opener plugin's ShellExecute showed the system error box for it.

use super::source::{
    executable_for_process, existing_wechat_windows, preferred_window, registry_executable,
    ProcessIdentity,
};
use crate::win32;
use std::{
    path::{Path, PathBuf},
    process::Command,
    thread,
    time::Duration,
};
use windows::Win32::{Foundation::HWND, System::Registry::HKEY_CLASSES_ROOT};

/// Error codes the frontend turns into bilingual hints (`src/features/messages/wechat/openError.ts`).
pub(super) const NOT_INSTALLED: &str = "wechat-open:not-installed";
pub(super) const NO_MAIN_WINDOW: &str = "wechat-open:no-main-window";
pub(super) const RESTORE_FAILED: &str = "wechat-open:restore-failed";
pub(super) const LAUNCH_FAILED: &str = "wechat-open:launch-failed";

const PROTOCOL_COMMAND_KEY: &str = "weixin\\shell\\open\\command";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum RestoreStep {
    Activate,
    Relaunch,
    Protocol,
}

/// Which ways to try, in order, to bring back a running WeChat main window.
/// Direct activation is only safe for a window that is already shown: forcing a
/// hidden Qt window visible can leave it blank, so those go through WeChat itself.
pub(super) fn restore_steps(visible: bool, minimized: bool, protocol_registered: bool) -> Vec<RestoreStep> {
    let mut steps = Vec::with_capacity(3);
    if visible && !minimized {
        steps.push(RestoreStep::Activate);
    }
    steps.push(RestoreStep::Relaunch);
    if protocol_registered {
        steps.push(RestoreStep::Protocol);
    }
    steps
}

fn protocol_registered() -> bool {
    win32::registry::read_string(HKEY_CLASSES_ROOT, PROTOCOL_COMMAND_KEY, "")
        .is_some_and(|command| !command.trim().is_empty())
}

/// Default install folders, for installs whose registry entries were removed or never written.
fn common_install_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    for variable in ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"] {
        let Some(root) = std::env::var_os(variable).map(PathBuf::from) else {
            continue;
        };
        paths.push(root.join("Tencent\\Weixin\\Weixin.exe"));
        paths.push(root.join("Tencent\\WeChat\\WeChat.exe"));
    }
    paths
}

/// An installed WeChat executable: registry first, then the default folders.
pub(super) fn installed_executable() -> Option<PathBuf> {
    registry_executable().or_else(|| common_install_paths().into_iter().find(|path| path.is_file()))
}

fn start(executable: &Path) -> bool {
    let mut command = Command::new(executable);
    if let Some(folder) = executable.parent() {
        command.current_dir(folder);
    }
    command.spawn().is_ok()
}

/// Starts WeChat when it is not running. Errors are codes for the frontend.
pub(super) fn launch_installed() -> Result<(), String> {
    let executable = installed_executable().ok_or(NOT_INSTALLED)?;
    if start(&executable) {
        Ok(())
    } else {
        Err(LAUNCH_FAILED.into())
    }
}

/// Finds the live main window and brings it forward. `Ok(None)` means WeChat
/// (or the requested instance) is not running.
pub(super) fn restore_wechat(requested: Option<ProcessIdentity>) -> Result<Option<HWND>, String> {
    let search = existing_wechat_windows()?;
    if !search.running {
        return Ok(None);
    }
    let original = if let Some(process) = requested {
        let Some(window) = search
            .found
            .iter()
            .find(|window| window.main_sized && window.process == process)
        else {
            return Ok(None);
        };
        window
    } else {
        preferred_window(&search.found).ok_or(NO_MAIN_WINDOW)?
    };
    let foreground = win32::window::foreground_window();
    let minimized = win32::window::is_minimized(original.handle);
    if foreground == original.handle && original.visible && !minimized {
        return Ok(Some(original.handle));
    }
    let expected = original.process;
    win32::window::allow_set_foreground_window(expected.pid);
    for step in restore_steps(original.visible, minimized, protocol_registered()) {
        let started = match step {
            RestoreStep::Activate => {
                if win32::window::force_foreground(original.handle) {
                    return Ok(Some(original.handle));
                }
                continue;
            }
            RestoreStep::Relaunch => executable_for_process(expected.pid).is_some_and(|path| start(&path)),
            RestoreStep::Protocol => win32::shell_open::open_url_without_ui("weixin://"),
        };
        if !started {
            continue;
        }
        if let Some(window) = wait_for_restored(expected)? {
            if requested.is_some() && win32::window::foreground_window() == foreground {
                let _ = win32::window::bring_to_foreground(window);
            }
            return Ok(Some(window));
        }
    }
    Err(RESTORE_FAILED.into())
}

fn wait_for_restored(expected: ProcessIdentity) -> Result<Option<HWND>, String> {
    for _ in 0..30 {
        thread::sleep(Duration::from_millis(50));
        let current = existing_wechat_windows()?;
        if let Some(window) = current.found.iter().find(|window| {
            window.main_sized
                && window.process == expected
                && window.visible
                && !win32::window::is_minimized(window.handle)
        }) {
            return Ok(Some(window.handle));
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_shown_window_is_activated_before_anything_is_started() {
        assert_eq!(
            restore_steps(true, false, true),
            [RestoreStep::Activate, RestoreStep::Relaunch, RestoreStep::Protocol]
        );
    }

    #[test]
    fn hidden_or_minimized_windows_are_restored_by_wechat_itself() {
        assert_eq!(restore_steps(false, false, true), [RestoreStep::Relaunch, RestoreStep::Protocol]);
        assert_eq!(restore_steps(true, true, true), [RestoreStep::Relaunch, RestoreStep::Protocol]);
    }

    #[test]
    fn an_unregistered_protocol_is_never_opened() {
        assert!(!restore_steps(true, false, false).contains(&RestoreStep::Protocol));
        assert!(!restore_steps(false, true, false).contains(&RestoreStep::Protocol));
    }

    #[test]
    fn default_install_folders_cover_both_client_generations() {
        let paths = common_install_paths();
        assert!(paths.iter().any(|path| path.ends_with("Weixin\\Weixin.exe")));
        assert!(paths.iter().any(|path| path.ends_with("WeChat\\WeChat.exe")));
    }
}
