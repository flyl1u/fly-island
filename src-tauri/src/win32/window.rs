//! Window enumeration and queries, cursor position, foreground switching,
//! interactivity checks and messages to other applications' windows.

use windows::{
    core::BOOL,
    Win32::{
        Foundation::{HWND, LPARAM, POINT, RECT, WPARAM},
        Graphics::Gdi::SetWindowRgn,
        System::Threading::{AttachThreadInput, GetCurrentThreadId},
        UI::{
            Input::KeyboardAndMouse::IsWindowEnabled,
            Shell::{Shell_NotifyIconGetRect, NOTIFYICONIDENTIFIER},
            WindowsAndMessaging::{
                AllowSetForegroundWindow, EnumWindows, GetClassNameW, GetCursorPos,
                GetForegroundWindow, GetWindow, GetWindowLongPtrW, GetWindowPlacement,
                GetWindowRect, GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindowVisible, SendMessageTimeoutW,
                SetForegroundWindow, ShowWindow, GWL_EXSTYLE, GW_OWNER, SMTO_ABORTIFHUNG,
                SMTO_BLOCK, SMTO_ERRORONEXIT, SW_RESTORE, WINDOWPLACEMENT, WM_NULL,
                WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
            },
        },
    },
};

/// Class names are at most 256 UTF-16 units including the terminator.
const MAX_CLASS_NAME_UNITS: usize = 256;

/// Calls `visit` for every top-level window, in z-order. Fails only when the
/// enumeration itself fails.
pub(crate) fn for_each_top_level_window(mut visit: impl FnMut(HWND)) -> windows::core::Result<()> {
    unsafe extern "system" fn visit_window(window: HWND, context: LPARAM) -> BOOL {
        // SAFETY: `context` is the address of the `&mut dyn FnMut(HWND)` below.
        // EnumWindows calls back synchronously on this thread, before
        // `for_each_top_level_window` returns, so the reference is live and not
        // aliased while the callback runs.
        let visit = unsafe { &mut *(context.0 as *mut &mut dyn FnMut(HWND)) };
        visit(window);
        true.into()
    }

    let mut visit: &mut dyn FnMut(HWND) = &mut visit;
    // SAFETY: `visit_window` matches WNDENUMPROC and only reads the context
    // pointer documented above, which outlives the call.
    unsafe {
        EnumWindows(
            Some(visit_window),
            LPARAM(&mut visit as *mut &mut dyn FnMut(HWND) as isize),
        )
    }
}

/// Title of `window`, truncated to `capacity - 1` UTF-16 units; empty when the
/// window has no title or is invalid.
pub(crate) fn window_text(window: HWND, capacity: usize) -> String {
    let mut text = vec![0u16; capacity];
    // SAFETY: GetWindowTextW writes at most `text.len()` units into the buffer
    // and returns how many it wrote.
    let length = unsafe { GetWindowTextW(window, &mut text) } as usize;
    String::from_utf16_lossy(&text[..length])
}

/// Window class name of `window`; empty when the window is invalid.
pub(crate) fn class_name(window: HWND) -> String {
    let mut class = [0u16; MAX_CLASS_NAME_UNITS];
    // SAFETY: GetClassNameW writes at most `class.len()` units and returns how
    // many it wrote.
    let length = unsafe { GetClassNameW(window, &mut class) } as usize;
    String::from_utf16_lossy(&class[..length])
}

/// Whether `window` has an owner window (owned popups, dialogs and the like).
pub(crate) fn has_owner(window: HWND) -> bool {
    // SAFETY: GetWindow takes the HWND by value and fails for invalid windows.
    unsafe { GetWindow(window, GW_OWNER) }.is_ok_and(|owner| !owner.is_invalid())
}

/// Restored (non-minimized, non-maximized) rectangle of `window`; `None` when it
/// cannot be read.
pub(crate) fn normal_position(window: HWND) -> Option<RECT> {
    let mut placement = WINDOWPLACEMENT {
        length: std::mem::size_of::<WINDOWPLACEMENT>() as u32,
        ..Default::default()
    };
    // SAFETY: `placement` is a valid local with `length` set as the API requires.
    unsafe { GetWindowPlacement(window, &mut placement) }.ok()?;
    Some(placement.rcNormalPosition)
}

pub(crate) fn is_visible(window: HWND) -> bool {
    // SAFETY: IsWindowVisible takes the HWND by value and returns false for
    // invalid windows.
    unsafe { IsWindowVisible(window) }.as_bool()
}

pub(crate) fn is_minimized(window: HWND) -> bool {
    // SAFETY: IsIconic takes the HWND by value and returns false for invalid
    // windows.
    unsafe { IsIconic(window) }.as_bool()
}

/// The current foreground window; a null HWND when there is none.
pub(crate) fn foreground_window() -> HWND {
    // SAFETY: GetForegroundWindow takes no arguments.
    unsafe { GetForegroundWindow() }
}

/// Lets `process_id` take the foreground on its next attempt. Failure is ignored:
/// the target may still be allowed for other reasons.
pub(crate) fn allow_set_foreground_window(process_id: u32) {
    // SAFETY: AllowSetForegroundWindow takes only a process id.
    let _ = unsafe { AllowSetForegroundWindow(process_id) };
}

/// Sends `message` to `window` and waits up to `timeout_ms` for it to be
/// handled, giving up early if the target hangs or exits. Returns whether the
/// message was handled. Only for messages whose parameters are plain values.
pub(crate) fn send_message_with_timeout(
    window: HWND,
    message: u32,
    wparam: usize,
    lparam: isize,
    timeout_ms: u32,
) -> bool {
    // SAFETY: the parameters are plain integers (callers must not pass pointers
    // for messages that expect them) and no result pointer is passed.
    unsafe {
        SendMessageTimeoutW(
            window,
            message,
            WPARAM(wparam),
            LPARAM(lparam),
            SMTO_ABORTIFHUNG | SMTO_BLOCK | SMTO_ERRORONEXIT,
            timeout_ms,
            None,
        )
    }
    .0 != 0
}

/// Whether the shell currently shows a notification-area icon with `id` owned by
/// `owner`.
pub(crate) fn notify_icon_exists(owner: HWND, id: u32) -> bool {
    let identifier = NOTIFYICONIDENTIFIER {
        cbSize: std::mem::size_of::<NOTIFYICONIDENTIFIER>() as u32,
        hWnd: owner,
        uID: id,
        ..Default::default()
    };
    // SAFETY: `identifier` is a valid local with `cbSize` set; the call only
    // reads it.
    unsafe { Shell_NotifyIconGetRect(&identifier) }.is_ok()
}

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

/// Restores a minimized `window` to its previous size and position. Only for
/// ordinary windows such as editors and terminals; apps that hide their UI in
/// a webview should restore themselves (see messenger_activation.rs).
pub(crate) fn restore_minimized(window: HWND) {
    if is_minimized(window) {
        // SAFETY: ShowWindow takes the HWND by value and fails for invalid
        // windows; its return value only reports the previous visibility.
        let _ = unsafe { ShowWindow(window, SW_RESTORE) };
    }
}

/// Brings `window`, owned by the calling thread, to the foreground while another
/// app holds it. Windows refuses SetForegroundWindow to a process that did not get
/// the last input; attaching to the foreground thread's input state lifts that
/// without synthesizing a key press (tao's fallback taps Alt, which leaves menu
/// bars armed in the app underneath). Returns whether `window` is now in front.
pub(crate) fn activate_from_background(window: HWND) -> bool {
    let foreground = foreground_window();
    if foreground == window {
        return true;
    }
    // SAFETY: both calls take only plain values; a null HWND yields thread id 0.
    let (foreground_thread, own_thread) =
        unsafe { (GetWindowThreadProcessId(foreground, None), GetCurrentThreadId()) };
    let attach = foreground_thread != 0 && foreground_thread != own_thread;
    // SAFETY: AttachThreadInput takes two thread ids and a flag; each attach is
    // undone below before returning, whatever SetForegroundWindow did.
    unsafe {
        let attached = attach && AttachThreadInput(own_thread, foreground_thread, true).as_bool();
        let _ = SetForegroundWindow(window);
        if attached {
            let _ = AttachThreadInput(own_thread, foreground_thread, false);
        }
    }
    foreground_window() == window
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
        assert_eq!(window_text(HWND::default(), 32), "");
        assert_eq!(class_name(HWND::default()), "");
        assert!(!has_owner(HWND::default()));
        assert_eq!(normal_position(HWND::default()).map(|_| ()), None);
        assert!(!is_visible(HWND::default()));
        assert!(!notify_icon_exists(HWND::default(), 1));
    }

    #[test]
    fn enumeration_visits_top_level_windows_through_the_closure() {
        let mut visited = Vec::new();
        for_each_top_level_window(|window| visited.push(window)).unwrap();
        assert!(!visited.is_empty());
        assert!(visited.iter().all(|window| !window.is_invalid()));
    }
}
