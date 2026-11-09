//! System-wide hotkeys delivered as `WM_HOTKEY` to a window.

use windows::{
    core::Result,
    Win32::{
        Foundation::HWND,
        UI::Input::KeyboardAndMouse::{
            RegisterHotKey, UnregisterHotKey, HOT_KEY_MODIFIERS, MOD_NOREPEAT,
        },
    },
};

/// Registers hotkey `id` on `window` for `key_code` with `modifiers` (`MOD_*`
/// bits). Auto-repeat is always suppressed. Fails when another application
/// already owns the combination.
pub(crate) fn register(window: HWND, id: i32, modifiers: u32, key_code: u32) -> Result<()> {
    // SAFETY: all arguments are plain values; the hotkey belongs to `window` and
    // is released by `unregister` or when the window is destroyed.
    unsafe {
        RegisterHotKey(
            Some(window),
            id,
            HOT_KEY_MODIFIERS(modifiers | MOD_NOREPEAT.0),
            key_code,
        )
    }
}

pub(crate) fn unregister(window: HWND, id: i32) -> Result<()> {
    // SAFETY: plain values only; fails harmlessly when `id` is not registered.
    unsafe { UnregisterHotKey(Some(window), id) }
}
