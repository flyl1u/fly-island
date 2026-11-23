//! A plain system message box, for errors that happen before any Tauri window exists.

use std::iter::once;

use windows::{
    core::PCWSTR,
    Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONWARNING, MB_OK, MB_SETFOREGROUND},
};

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(once(0)).collect()
}

/// Shows a modal warning with an OK button and waits until it is dismissed.
pub(crate) fn show_warning(title: &str, text: &str) {
    let title = wide(title);
    let text = wide(text);
    // SAFETY: both buffers are NUL-terminated UTF-16 that outlive the call, and a null owner
    // window is allowed.
    unsafe {
        MessageBoxW(
            None,
            PCWSTR(text.as_ptr()),
            PCWSTR(title.as_ptr()),
            MB_OK | MB_ICONWARNING | MB_SETFOREGROUND,
        );
    }
}
