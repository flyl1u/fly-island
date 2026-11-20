//! Launch at startup through the current user's Run key.
//!
//! The Run value (its name stays `FocuSD Island`) starts the app with [`AUTOSTART_ARG`], so a
//! launch at sign-in can be told from one by hand. At sign-in the desktop, Explorer and every
//! other startup app compete for the machine, so the island then shows without taking the
//! focus and its background services that watch other apps (QQ, WeChat, the NetEase plugin)
//! wait a little and start one after another ([`hold_after_autostart`]). Values written by
//! older versions, without the argument, are rewritten once in the background.
//!
//! The value is read and written through the registry API (win32/registry.rs). Each read used to
//! start `reg.exe`, and `get_launch_at_startup` is a synchronous command, so opening the settings
//! window waited on a child process on the main thread (2026-11-19).

use std::{
    sync::OnceLock,
    thread,
    path::Path,
    time::{Duration, Instant},
};

use windows::Win32::System::Registry::HKEY_CURRENT_USER;

use crate::win32::registry;

/// The Run key under `HKEY_CURRENT_USER`.
pub(super) const STARTUP_REGISTRY_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
pub(super) const STARTUP_REGISTRY_VALUE: &str = "FocuSD Island";
const STARTUP_APPROVED_RUN_KEY: &str =
    r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
/// Passed by the Run value; any other launch has no arguments.
const AUTOSTART_ARG: &str = "--autostart";

static LAUNCHED_AT: OnceLock<Instant> = OnceLock::new();

/// Notes when the process started; called first thing in `run()`.
pub(crate) fn note_launch() {
    let _ = LAUNCHED_AT.set(Instant::now());
}

/// Started by the Run value at sign-in.
pub(crate) fn launched_at_startup() -> bool {
    static AT_STARTUP: OnceLock<bool> = OnceLock::new();
    *AT_STARTUP.get_or_init(|| std::env::args().skip(1).any(|arg| arg == AUTOSTART_ARG))
}

/// Whether this process was started by the Windows Run value.
#[tauri::command]
pub fn is_autostart_launch() -> bool {
    launched_at_startup()
}

/// On a launch at sign-in, blocks the calling background thread until `delay` after the
/// process started; at once otherwise. Each service passes its own delay so they start in turn.
pub(crate) fn hold_after_autostart(delay: Duration) {
    if !launched_at_startup() {
        return;
    }
    let elapsed = LAUNCHED_AT.get_or_init(Instant::now).elapsed();
    if let Some(left) = delay.checked_sub(elapsed) {
        thread::sleep(left);
    }
}

fn startup_value() -> Result<String, String> {
    let current_exe = std::env::current_exe()
        .map_err(|error| format!("Failed to resolve current executable: {error}"))?;
    Ok(startup_value_for(&current_exe))
}

fn startup_value_for(executable: &Path) -> String {
    format!("\"{}\" {AUTOSTART_ARG}", executable.display())
}

/// The Run value as it is now, `None` when launch at startup is off.
fn read_value() -> Option<String> {
    registry::read_string(HKEY_CURRENT_USER, STARTUP_REGISTRY_KEY, STARTUP_REGISTRY_VALUE)
}

/// Finds an exact command-line argument while ignoring text inside a quoted executable path.
fn command_has_argument(command_line: &str, expected: &str) -> bool {
    let mut quoted = false;
    let mut argument = String::new();
    for character in command_line.chars() {
        match character {
            '"' => quoted = !quoted,
            ' ' | '\t' if !quoted => {
                if argument == expected {
                    return true;
                }
                argument.clear();
            }
            character => argument.push(character),
        }
    }
    argument == expected
}

/// Explorer marks a disabled Run entry with a DWORD state of 3 at the start of its binary blob.
/// Unknown or malformed values are treated as not disabled so the UI only warns on known state.
fn startup_approved_is_disabled(value: &[u8]) -> bool {
    value.len() >= 12 && value[..4] == [3, 0, 0, 0]
}

fn disabled_by_windows() -> bool {
    registry::read_binary(
        HKEY_CURRENT_USER,
        STARTUP_APPROVED_RUN_KEY,
        STARTUP_REGISTRY_VALUE,
    )
    .is_some_and(|value| startup_approved_is_disabled(&value))
}

/// Read-only status of the Task Manager / Startup Apps disable marker.
#[tauri::command]
pub fn is_launch_at_startup_disabled() -> bool {
    read_value().is_some() && disabled_by_windows()
}

/// A value written before the argument existed is rewritten to the current form (same name,
/// same executable), a minute after start so it costs nothing at sign-in.
pub(crate) fn upgrade_legacy_value() {
    thread::spawn(|| {
        thread::sleep(Duration::from_secs(60));
        if read_value().is_some_and(|value| !command_has_argument(&value, AUTOSTART_ARG)) {
            if let Err(error) = set_launch_at_startup(true) {
                eprintln!("failed to update the startup entry: {error}");
            }
        }
    });
}

#[tauri::command]
pub fn get_launch_at_startup() -> Result<bool, String> {
    Ok(read_value().is_some())
}

#[tauri::command]
pub fn set_launch_at_startup(enabled: bool) -> Result<(), String> {
    let result = if enabled {
        registry::write_string(HKEY_CURRENT_USER, STARTUP_REGISTRY_KEY, STARTUP_REGISTRY_VALUE, &startup_value()?)
    } else {
        registry::delete_value(HKEY_CURRENT_USER, STARTUP_REGISTRY_KEY, STARTUP_REGISTRY_VALUE)
    };
    result.map_err(|error| format!("Failed to update startup registry: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn startup_argument_is_matched_outside_the_quoted_executable_path() {
        assert!(command_has_argument(
            r#""C:\Program Files\Fly Island.exe" --autostart"#,
            AUTOSTART_ARG
        ));
        assert!(!command_has_argument(
            r#""C:\Apps\--autostart\Fly Island.exe""#,
            AUTOSTART_ARG
        ));
        assert!(!command_has_argument(
            r#""C:\Apps\--autostart Folder\Fly Island.exe" --autostart-old"#,
            AUTOSTART_ARG
        ));
    }

    #[test]
    fn startup_value_quotes_paths_with_spaces_and_unicode() {
        assert_eq!(
            startup_value_for(Path::new(r"C:\Program Files\小岛\Fly Island.exe")),
            r#""C:\Program Files\小岛\Fly Island.exe" --autostart"#
        );
    }

    #[test]
    fn startup_approved_recognizes_only_the_disabled_dword() {
        assert!(startup_approved_is_disabled(&[3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
        assert!(!startup_approved_is_disabled(&[2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
        assert!(!startup_approved_is_disabled(&[3, 0, 0, 0]));
        assert!(!startup_approved_is_disabled(&[3, 0, 0]));
        assert!(!startup_approved_is_disabled(&[]));
    }
}
