use windows::Win32::Foundation::HWND;

use crate::win32;

pub fn is_interactive_window(window: HWND) -> bool {
    win32::window::is_interactive(window)
}

pub fn activate_existing_window(window: HWND, name: &str) -> Result<(), String> {
    // The client must restore its own UI first; Win32 restore commands can expose a hidden webview.
    if !is_interactive_window(window) {
        return Err(format!("{name}尚未恢复可交互的主窗口，请从系统托盘打开。"));
    }
    if win32::window::bring_to_foreground(window) {
        return Ok(());
    }
    Err(format!(
        "已找到{name}窗口，但未能切换到前台，请点击任务栏或托盘中的{name}。"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::{
        core::w,
        Win32::UI::WindowsAndMessaging::{
            CreateWindowExW, DestroyWindow, IsWindowVisible, WINDOW_EX_STYLE, WS_POPUP,
        },
    };

    #[test]
    fn a_hidden_preloaded_window_is_never_forced_visible() {
        unsafe {
            let window = CreateWindowExW(
                WINDOW_EX_STYLE::default(),
                w!("STATIC"),
                w!("FocuSD activation test"),
                WS_POPUP,
                0,
                0,
                10,
                10,
                None,
                None,
                None,
                None,
            )
            .unwrap();
            let result = activate_existing_window(window, "QQ");
            let visible = IsWindowVisible(window).as_bool();
            DestroyWindow(window).unwrap();
            assert!(result.is_err());
            assert!(!visible, "A rejected hidden window must remain hidden");
        }
    }
}
