//! Keyboard and mouse button state queries, and synthesized key presses.

use windows::Win32::UI::Input::KeyboardAndMouse::{
    keybd_event, GetAsyncKeyState, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, VIRTUAL_KEY,
    VK_LBUTTON, VK_RBUTTON,
};

/// Whether the left mouse button is physically held right now.
pub(crate) fn is_left_button_down() -> bool {
    is_key_down(VK_LBUTTON)
}

/// Whether the left or right mouse button is physically held right now.
pub(crate) fn is_any_button_down() -> bool {
    is_key_down(VK_LBUTTON) || is_key_down(VK_RBUTTON)
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
