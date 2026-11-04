//! Keyboard and mouse button state queries for window dragging.

use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VIRTUAL_KEY, VK_CONTROL, VK_LBUTTON,
};

/// Whether either Ctrl key is physically held right now.
pub(crate) fn is_control_key_down() -> bool {
    is_key_down(VK_CONTROL)
}

/// Whether the left mouse button is physically held right now.
pub(crate) fn is_left_button_down() -> bool {
    is_key_down(VK_LBUTTON)
}

fn is_key_down(key: VIRTUAL_KEY) -> bool {
    // SAFETY: GetAsyncKeyState only reads global key state and accepts any key code.
    // The high bit (negative value) means the key is currently down.
    let state = unsafe { GetAsyncKeyState(i32::from(key.0)) };
    state < 0
}
