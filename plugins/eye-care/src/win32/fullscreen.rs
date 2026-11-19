//! Detect foreground full-screen applications, excluding our own break surfaces and desktop.
use std::mem::size_of;
use windows::Win32::{
    Foundation::RECT,
    Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST},
    UI::{
        Shell::{SHQueryUserNotificationState, QUNS_RUNNING_D3D_FULL_SCREEN},
        WindowsAndMessaging::{
            GetClassNameW, GetForegroundWindow, GetWindowLongW, GetWindowRect,
            GetWindowThreadProcessId, GWL_STYLE, WS_CAPTION, WS_THICKFRAME,
        },
    },
};

pub fn active() -> Option<bool> {
    // SAFETY: all queries use the current foreground HWND and stack-allocated outputs.
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return Some(false);
        }
        let mut process = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut process));
        if process == std::process::id() {
            return Some(false);
        }
        let mut class = [0u16; 128];
        let length = GetClassNameW(hwnd, &mut class) as usize;
        if matches!(
            String::from_utf16_lossy(&class[..length]).as_str(),
            "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd"
        ) {
            return Some(false);
        }
        if SHQueryUserNotificationState().ok() == Some(QUNS_RUNNING_D3D_FULL_SCREEN) {
            return Some(true);
        }
        // A maximized framed editor is not full-screen, even with an auto-hidden taskbar.
        let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
        if style & (WS_CAPTION.0 | WS_THICKFRAME.0) != 0 {
            return Some(false);
        }
        let mut rect = RECT::default();
        GetWindowRect(hwnd, &mut rect).ok()?;
        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO {
            cbSize: size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(monitor, &mut info).as_bool() {
            return None;
        }
        Some(covers(rect, info.rcMonitor))
    }
}

fn covers(window: RECT, screen: RECT) -> bool {
    window.left <= screen.left
        && window.top <= screen.top
        && window.right >= screen.right
        && window.bottom >= screen.bottom
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn full_screen_includes_negative_monitor_coordinates_but_not_work_area() {
        let screen = RECT {
            left: -1920,
            top: -100,
            right: 0,
            bottom: 980,
        };
        assert!(covers(screen, screen));
        assert!(!covers(
            RECT {
                bottom: 940,
                ..screen
            },
            screen
        ));
        assert!(!covers(
            RECT {
                left: 0,
                top: 0,
                right: 1920,
                bottom: 1080
            },
            screen
        ));
    }
}
