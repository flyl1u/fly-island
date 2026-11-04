//! Shell hook notifications (window created / activated / flashing / redrawn),
//! delivered to a registered top-level window.

use windows::{
    core::{w, Error, Result},
    Win32::{
        Foundation::HWND,
        UI::WindowsAndMessaging::{
            DeregisterShellHookWindow, RegisterShellHookWindow, RegisterWindowMessageW,
        },
    },
};

/// The message id the shell uses for hook notifications (`"SHELLHOOK"`).
pub(crate) fn hook_message() -> Result<u32> {
    // SAFETY: the argument is a static NUL-terminated string.
    match unsafe { RegisterWindowMessageW(w!("SHELLHOOK")) } {
        0 => Err(Error::from_win32()),
        message => Ok(message),
    }
}

/// Starts sending shell hook notifications to `window`. Message-only windows do
/// not receive them.
pub(crate) fn register_window(window: HWND) -> Result<()> {
    // SAFETY: takes the HWND by value and fails for invalid windows.
    unsafe { RegisterShellHookWindow(window) }.ok()
}

pub(crate) fn deregister_window(window: HWND) -> Result<()> {
    // SAFETY: takes the HWND by value; fails harmlessly if not registered.
    unsafe { DeregisterShellHookWindow(window) }.ok()
}
