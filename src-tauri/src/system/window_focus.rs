//! Focusing the app's own windows without tao's synthesized Alt press.
//!
//! `WebviewWindow::set_focus` ends in tao's `force_window_active`: when
//! `SetForegroundWindow` is refused (this process did not get the last input), it
//! sends a synthetic Left Alt down + up and tries again. If the user is holding Alt
//! at that moment, for Alt+Tab or another Alt shortcut, the synthetic Alt-up ends
//! the gesture: the task switcher closes or picks the wrong window. Here the window
//! is brought forward by attaching to the foreground thread's input instead (paired
//! with a detach, see `win32::window::force_foreground`), and `set_focus` is only
//! called once the window is in front, where tao does nothing but move the focus.

use tauri::WebviewWindow;

use crate::win32;

/// Brings `window` to the front and focuses its webview. When Windows refuses the
/// switch the window simply stays behind, rather than faking an Alt key press.
pub(crate) fn focus_window(window: &WebviewWindow) -> Result<(), String> {
    let hwnd = window.hwnd().map_err(|error| error.to_string())?;
    if win32::window::foreground_window() != hwnd && !win32::window::force_foreground(hwnd) {
        return Ok(());
    }
    window.set_focus().map_err(|error| error.to_string())
}
