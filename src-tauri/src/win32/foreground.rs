//! 前台与焦点：截图覆盖层要"能点也能打字"，两件事都得做到。

use windows::core::BOOL;
use windows::Win32::{
    Foundation::{HWND, LPARAM},
    System::Threading::{AttachThreadInput, GetCurrentThreadId},
    UI::Input::KeyboardAndMouse::SetFocus,
    UI::WindowsAndMessaging::{
        BringWindowToTop, EnumChildWindows, GetClassNameW, GetForegroundWindow, GetWindowThreadProcessId, IsWindowVisible,
        SetForegroundWindow,
    },
};

/// 把 `hwnd` 提到前台并激活；尽力而为，失败不致命。
pub(crate) fn bring_to_front(hwnd: HWND) {
    // SAFETY: 只传窗口句柄与线程 id；AttachThreadInput 成对调用，失败也会解绑。
    unsafe {
        let foreground = GetForegroundWindow();
        let foreground_thread = if foreground.is_invalid() {
            0
        } else {
            GetWindowThreadProcessId(foreground, None)
        };
        let current = GetCurrentThreadId();
        let attached =
            foreground_thread != 0 && foreground_thread != current && AttachThreadInput(foreground_thread, current, true).as_bool();
        let _ = SetForegroundWindow(hwnd);
        let _ = BringWindowToTop(hwnd);
        if attached {
            let _ = AttachThreadInput(foreground_thread, current, false);
        }
    }
}

/// 当前前台窗口是不是 `hwnd`。
pub(crate) fn is_foreground(hwnd: HWND) -> bool {
    // SAFETY: 只比较句柄。
    unsafe { GetForegroundWindow() == hwnd }
}

/// 把键盘焦点交给窗口里的 WebView2 子窗口。
///
/// 只调用 `SetForegroundWindow` 不够：Tauri 窗口成了前台，但 WebView2 的子窗口
/// 没有焦点时键盘仍进不了页面，表现就是"能点、不能打字"。
pub(crate) fn focus_webview(hwnd: HWND) {
    // SAFETY: 遍历自身子窗口，只对匹配到的句柄调用 SetFocus。
    unsafe {
        let mut target = HWND::default();
        let _ = EnumChildWindows(
            Some(hwnd),
            Some(find_webview_child),
            LPARAM(std::ptr::addr_of_mut!(target) as isize),
        );
        let focus = if target.is_invalid() { hwnd } else { target };
        let _ = SetFocus(Some(focus));
    }
}

unsafe extern "system" fn find_webview_child(child: HWND, param: LPARAM) -> BOOL {
    // SAFETY: param 来自 focus_webview 传入的 &mut HWND，在遍历期间一直有效。
    unsafe {
        let mut buffer = [0u16; 128];
        let length = GetClassNameW(child, &mut buffer);
        if length > 0 {
            let name = String::from_utf16_lossy(&buffer[..length as usize]);
            if name.contains("Chrome_WidgetWin") && IsWindowVisible(child).as_bool() {
                let target = param.0 as *mut HWND;
                *target = child;
                return BOOL(0);
            }
        }
        BOOL(1)
    }
}
