//! Keyboard state queries and synthetic input for the Win + drag gesture.

use std::mem::size_of;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
    VIRTUAL_KEY, VK_LWIN, VK_RWIN,
};

/// Unassigned virtual-key code. Pressing it between Win down and Win up keeps the
/// shell from treating the Win release as "open the Start menu", without triggering
/// any shortcut of its own.
const UNASSIGNED_KEY: VIRTUAL_KEY = VIRTUAL_KEY(0xFF);

/// Whether either Windows key is physically held right now.
pub(crate) fn is_windows_key_down() -> bool {
    is_key_down(VK_LWIN) || is_key_down(VK_RWIN)
}

/// Taps an unassigned key so releasing the held Win key does not open the Start menu.
pub(crate) fn suppress_start_menu() {
    let inputs = [keyboard_input(UNASSIGNED_KEY, false), keyboard_input(UNASSIGNED_KEY, true)];
    // SAFETY: `inputs` is a valid, initialized slice of keyboard INPUT structures and the
    // size argument is the size of one INPUT, exactly as SendInput requires.
    unsafe { SendInput(&inputs, size_of::<INPUT>() as i32) };
}

fn is_key_down(key: VIRTUAL_KEY) -> bool {
    // SAFETY: GetAsyncKeyState only reads global key state and accepts any key code.
    // The high bit (negative value) means the key is currently down.
    let state = unsafe { GetAsyncKeyState(i32::from(key.0)) };
    state < 0
}

fn keyboard_input(key: VIRTUAL_KEY, key_up: bool) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: key,
                dwFlags: if key_up { KEYEVENTF_KEYUP } else { Default::default() },
                ..Default::default()
            },
        },
    }
}
