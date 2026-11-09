//! Clipboard change notifications (`WM_CLIPBOARDUPDATE`).

use windows::{
    core::Result,
    Win32::{
        Foundation::HWND,
        System::DataExchange::{AddClipboardFormatListener, RemoveClipboardFormatListener},
    },
};

/// Sends `WM_CLIPBOARDUPDATE` to `window` whenever the clipboard changes.
pub(crate) fn add_format_listener(window: HWND) -> Result<()> {
    // SAFETY: takes the HWND by value and fails for invalid windows.
    unsafe { AddClipboardFormatListener(window) }
}

pub(crate) fn remove_format_listener(window: HWND) -> Result<()> {
    // SAFETY: takes the HWND by value; fails harmlessly if not registered.
    unsafe { RemoveClipboardFormatListener(window) }
}

