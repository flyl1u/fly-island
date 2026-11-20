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
    time::{Duration, Instant},
};

use windows::Win32::System::Registry::HKEY_CURRENT_USER;

use crate::win32::registry;

/// The Run key under `HKEY_CURRENT_USER`.
pub(super) const STARTUP_REGISTRY_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
pub(super) const STARTUP_REGISTRY_VALUE: &str = "FocuSD Island";
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
    Ok(format!("\"{}\" {AUTOSTART_ARG}", current_exe.display()))
}

/// The Run value as it is now, `None` when launch at startup is off.
fn read_value() -> Option<String> {
    registry::read_string(HKEY_CURRENT_USER, STARTUP_REGISTRY_KEY, STARTUP_REGISTRY_VALUE)
}

/// A value written before the argument existed is rewritten to the current form (same name,
/// same executable), a minute after start so it costs nothing at sign-in.
pub(crate) fn upgrade_legacy_value() {
    thread::spawn(|| {
        thread::sleep(Duration::from_secs(60));
        if read_value().is_some_and(|value| !value.contains(AUTOSTART_ARG)) {
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
