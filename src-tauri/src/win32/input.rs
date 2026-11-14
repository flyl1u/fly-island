//! Keyboard and mouse button state queries, and synthesized key presses.

use std::{mem::size_of, time::Duration};
use windows::Win32::{
    Foundation::{HWND, POINT},
    UI::{
        Input::KeyboardAndMouse::{
            keybd_event, GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_MOUSE,
            KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
            MOUSEINPUT, VIRTUAL_KEY, VK_CONTROL, VK_LBUTTON, VK_LWIN, VK_MENU, VK_RBUTTON, VK_RWIN,
            VK_SHIFT,
        },
        WindowsAndMessaging::{GetAncestor, SetCursorPos, WindowFromPoint, GA_ROOT},
    },
};

use super::window;

/// Clicks only the requested foreground window, leaving active mouse or keyboard gestures alone.
pub(crate) fn click_in_foreground(target: HWND, point: POINT) -> bool {
    let can_click = || {
        if target.is_invalid()
            || window::foreground_window() != target
            || is_any_button_down()
            || [VK_CONTROL, VK_MENU, VK_SHIFT, VK_LWIN, VK_RWIN]
                .into_iter()
                .any(is_key_down)
        {
            return false;
        }
        // SAFETY: both window queries take values, and can return a null HWND.
        unsafe { GetAncestor(WindowFromPoint(point), GA_ROOT) == target }
    };
    if !can_click() {
        return false;
    }
    let Some(previous) = window::cursor_position() else {
        return false;
    };
    // SAFETY: SetCursorPos takes screen coordinates by value.
    if unsafe { SetCursorPos(point.x, point.y) }.is_err() {
        return false;
    }
    let event = |flags| INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dwFlags: flags,
                ..Default::default()
            },
        },
    };
    let sent = if can_click() && window::cursor_position().is_some_and(|at| at == point) {
        // SAFETY: both mouse INPUT records are initialized, and the size matches INPUT.
        unsafe {
            SendInput(
                &[event(MOUSEEVENTF_LEFTDOWN), event(MOUSEEVENTF_LEFTUP)],
                size_of::<INPUT>() as i32,
            )
        }
    } else {
        0
    };
    if sent == 1 {
        // SAFETY: this initialized mouse INPUT releases the synthetic down event sent above.
        unsafe { SendInput(&[event(MOUSEEVENTF_LEFTUP)], size_of::<INPUT>() as i32) };
    }
    if sent > 0 {
        std::thread::sleep(Duration::from_millis(45));
    }
    if window::cursor_position().is_some_and(|at| at == point) {
        // SAFETY: these are the coordinates obtained from GetCursorPos above.
        let _ = unsafe { SetCursorPos(previous.x, previous.y) };
    }
    sent == 2
}

/// Whether the left mouse button is physically held right now.
pub(crate) fn is_left_button_down() -> bool {
    is_key_down(VK_LBUTTON)
}

/// Whether the left or right mouse button is physically held right now.
pub(crate) fn is_any_button_down() -> bool {
    is_key_down(VK_LBUTTON) || is_key_down(VK_RBUTTON)
}

/// Whether Alt, Ctrl or a Windows key is physically held: a keyboard shortcut such
/// as Alt+Tab may be in progress.
pub(crate) fn is_shortcut_modifier_down() -> bool {
    [VK_MENU, VK_CONTROL, VK_LWIN, VK_RWIN]
        .into_iter()
        .any(is_key_down)
}

/// Synthesizes a key press for `key`, as if typed on the keyboard.
pub(crate) fn send_key_down(key: VIRTUAL_KEY) {
    send_key_event(key, KEYBD_EVENT_FLAGS(0));
}

/// Synthesizes a key release for `key`.
pub(crate) fn send_key_up(key: VIRTUAL_KEY) {
    send_key_event(key, KEYEVENTF_KEYUP);
}

fn send_key_event(key: VIRTUAL_KEY, flags: KEYBD_EVENT_FLAGS) {
    // SAFETY: keybd_event takes only plain values and inserts the event into the
    // input stream; it reads no caller memory. Virtual-key codes fit in a u8.
    unsafe { keybd_event(key.0 as u8, 0, flags, 0) };
}

fn is_key_down(key: VIRTUAL_KEY) -> bool {
    // SAFETY: GetAsyncKeyState only reads global key state and accepts any key code.
    // The high bit (negative value) means the key is currently down.
    let state = unsafe { GetAsyncKeyState(i32::from(key.0)) };
    state < 0
}
