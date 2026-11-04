//! Clipboard change notifications (`WM_CLIPBOARDUPDATE`).

use windows::{
    core::Result,
    Win32::{
        Foundation::HWND,
        System::DataExchange::{
            AddClipboardFormatListener, CloseClipboard, EmptyClipboard, OpenClipboard,
            RemoveClipboardFormatListener,
        },
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

/// Removes whatever is on the clipboard. Used to put back an empty clipboard.
pub(crate) fn empty() -> Result<()> {
    // SAFETY: OpenClipboard(None) claims the clipboard for this thread and fails if
    // another owner holds it. EmptyClipboard and CloseClipboard are the matching
    // calls; none of them read caller memory. Close runs even when emptying fails.
    unsafe {
        OpenClipboard(None)?;
        let emptied = EmptyClipboard();
        CloseClipboard()?;
        emptied
    }
}
