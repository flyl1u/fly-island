//! Window geometry, cursor position, foreground switching and interactivity checks.

use windows::Win32::{
    Foundation::{HWND, LPARAM, POINT, RECT, WPARAM},
    Graphics::Gdi::SetWindowRgn,
    UI::{
        Input::KeyboardAndMouse::IsWindowEnabled,
        WindowsAndMessaging::{
            GetCursorPos, GetForegroundWindow, GetWindowLongPtrW, GetWindowRect, IsIconic,
            IsWindowVisible, SendMessageTimeoutW, SetForegroundWindow, GWL_EXSTYLE,
            SMTO_ABORTIFHUNG, SMTO_BLOCK, SMTO_ERRORONEXIT, WM_NULL, WS_EX_NOACTIVATE,
            WS_EX_TOOLWINDOW,
        },
    },
};

/// Screen rectangle of `window`; `None` when the window is invalid.
pub(crate) fn window_rect(window: HWND) -> Option<RECT> {
    let mut rect = RECT::default();
    // SAFETY: GetWindowRect fails for invalid HWND values and writes only into
    // the valid local `rect`.
    unsafe { GetWindowRect(window, &mut rect) }.ok()?;
    Some(rect)
}

/// Cursor position in screen coordinates; `None` when it cannot be read (for
/// example on the secure desktop).
pub(crate) fn cursor_position() -> Option<POINT> {
    let mut cursor = POINT::default();
    // SAFETY: GetCursorPos writes only into the valid local `cursor`.
    unsafe { GetCursorPos(&mut cursor) }.ok()?;
    Some(cursor)
}

/// Removes any window region so the whole window is drawn again. Returns whether
/// the call succeeded.
pub(crate) fn clear_window_region(window: HWND) -> bool {
    // SAFETY: passing no region transfers no ownership; SetWindowRgn fails for an
    // invalid HWND instead of touching memory.
    let result = unsafe { SetWindowRgn(window, None, true) };
    result != 0
}

/// Whether `window` is visible, not minimized, enabled, can be activated, and its
/// thread answers messages within 250 ms.
pub(crate) fn is_interactive(window: HWND) -> bool {
    // SAFETY: every call takes the HWND by value and fails or returns a neutral
    // value for invalid windows; SendMessageTimeoutW sends WM_NULL with zero
    // parameters and no result pointer, so nothing is read from or written to
    // caller memory.
    unsafe {
        let style = GetWindowLongPtrW(window, GWL_EXSTYLE) as u32;
        IsWindowVisible(window).as_bool()
            && !IsIconic(window).as_bool()
            && IsWindowEnabled(window).as_bool()
            && style & (WS_EX_NOACTIVATE.0 | WS_EX_TOOLWINDOW.0) == 0
            && SendMessageTimeoutW(
                window,
                WM_NULL,
                WPARAM(0),
                LPARAM(0),
                SMTO_ABORTIFHUNG | SMTO_BLOCK | SMTO_ERRORONEXIT,
                250,
                None,
            )
            .0 != 0
    }
}

/// Whether `window` is already in the foreground or was just brought there.
pub(crate) fn bring_to_foreground(window: HWND) -> bool {
    // SAFETY: GetForegroundWindow takes no arguments; SetForegroundWindow takes
    // the HWND by value and fails for invalid windows.
    unsafe { GetForegroundWindow() == window || SetForegroundWindow(window).as_bool() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_windows_have_no_rect_and_are_not_interactive() {
        assert_eq!(window_rect(HWND::default()).map(|_| ()), None);
        assert!(!is_interactive(HWND::default()));
        assert!(!clear_window_region(HWND::default()));
    }
}
