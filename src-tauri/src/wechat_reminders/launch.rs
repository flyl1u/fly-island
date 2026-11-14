//! Brings WeChat to the front, or starts it, without ever triggering a Windows
//! "application not found" dialog.
//!
//! Order: activate a shown (or minimized) main window directly; otherwise the
//! `weixin://` protocol, only when it is registered, opened without the system
//! error box (Weixin 4.x and some installs do not register it). A running WeChat
//! is never started again: a second Weixin.exe does not restore the hidden window
//! but opens the "进入微信" sign-in dialog, even for a signed-in user (v3.2.1).
//! A hidden window with no protocol is left to the user (the tray icon).

use super::source::{
    existing_wechat_windows, preferred_window, registry_executable,
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
    Protocol,
}

/// Which ways to try, in order, to bring back a running WeChat main window.
/// Direct activation is only safe for a window that is shown or minimized (it is
/// restored first): forcing a hidden Qt window visible can leave it blank, so those
/// go through WeChat's own protocol handler.
pub(super) fn restore_steps(visible: bool, protocol_registered: bool) -> Vec<RestoreStep> {
    let mut steps = Vec::with_capacity(2);
    if visible {
        steps.push(RestoreStep::Activate);
    }
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
    for step in restore_steps(original.visible, protocol_registered()) {
        let started = match step {
            RestoreStep::Activate => {
                if win32::window::force_foreground(original.handle) {
                    return Ok(Some(original.handle));
                }
                continue;
            }
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
    fn a_shown_or_minimized_window_is_activated_before_the_protocol() {
        assert_eq!(restore_steps(true, true), [RestoreStep::Activate, RestoreStep::Protocol]);
    }

    #[test]
    fn a_hidden_window_goes_through_the_protocol_only() {
        assert_eq!(restore_steps(false, true), [RestoreStep::Protocol]);
        // No protocol: nothing is tried (never a second Weixin.exe, which asks to sign in).
        assert!(restore_steps(false, false).is_empty());
    }

    #[test]
    fn an_unregistered_protocol_is_never_opened() {
        assert_eq!(restore_steps(true, false), [RestoreStep::Activate]);
    }

    #[test]
    fn default_install_folders_cover_both_client_generations() {
        let paths = common_install_paths();
        assert!(paths.iter().any(|path| path.ends_with("Weixin\\Weixin.exe")));
        assert!(paths.iter().any(|path| path.ends_with("WeChat\\WeChat.exe")));
    }
}
