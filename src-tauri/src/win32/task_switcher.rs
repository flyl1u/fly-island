//! Keeps a window out of Alt+Tab (and the taskbar) for its whole life.
//!
//! tao gives every unowned window `WS_EX_APPWINDOW` and rewrites the whole extended
//! style each time one of its flags changes (the island toggles click-through many
//! times a second), so setting `WS_EX_TOOLWINDOW` once would not last. Instead a
//! subclass rewrites every extended-style change on its way in (`WM_STYLECHANGING`).

use windows::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, WPARAM},
    UI::{
        Shell::{DefSubclassProc, SetWindowSubclass},
        WindowsAndMessaging::{
            GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, STYLESTRUCT,
            SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
            WM_STYLECHANGING, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
        },
    },
};

const SUBCLASS_ID: usize = 0x4644_5441; // "FDTA"

/// The extended style with the window kept out of the task switcher.
pub(crate) fn without_task_switcher_entry(ex_style: u32) -> u32 {
    (ex_style | WS_EX_TOOLWINDOW.0) & !WS_EX_APPWINDOW.0
}

unsafe extern "system" fn subclass_proc(
    window: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    _data: usize,
) -> LRESULT {
    if message == WM_STYLECHANGING && wparam.0 as i32 == GWL_EXSTYLE.0 && lparam.0 != 0 {
        // SAFETY: for WM_STYLECHANGING the system passes a valid, writable STYLESTRUCT
        // in lParam (checked non-null above) for the duration of this call.
        let styles = unsafe { &mut *(lparam.0 as *mut STYLESTRUCT) };
        styles.styleNew = without_task_switcher_entry(styles.styleNew);
    }
    // SAFETY: forwards exactly the arguments this subclass procedure received.
    unsafe { DefSubclassProc(window, message, wparam, lparam) }
}

/// Removes `window` from Alt+Tab and the taskbar and keeps it out. Must run on the
/// thread that owns `window` (SetWindowSubclass refuses other threads). Returns
/// whether the subclass was installed.
pub(crate) fn hide_from_task_switcher(window: HWND) -> bool {
    // SAFETY: `subclass_proc` matches SUBCLASSPROC and uses no reference data; the
    // subclass lives as long as the window and is removed by the system with it.
    if !unsafe { SetWindowSubclass(window, Some(subclass_proc), SUBCLASS_ID, 0) }.as_bool() {
        return false;
    }
    // SAFETY: plain HWND/value calls; setting GWL_EXSTYLE goes through the subclass
    // above, and SWP_FRAMECHANGED makes the shell re-read the style. Invalid windows
    // only make the calls fail.
    unsafe {
        let current = GetWindowLongPtrW(window, GWL_EXSTYLE) as u32;
        SetWindowLongPtrW(window, GWL_EXSTYLE, without_task_switcher_entry(current) as isize);
        let _ = SetWindowPos(
            window,
            None,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        );
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::Win32::UI::WindowsAndMessaging::{WS_EX_LAYERED, WS_EX_TOPMOST, WS_EX_TRANSPARENT};

    #[test]
    fn the_app_window_flag_becomes_a_tool_window_and_other_bits_stay() {
        let tao = WS_EX_APPWINDOW.0 | WS_EX_TOPMOST.0 | WS_EX_TRANSPARENT.0 | WS_EX_LAYERED.0;
        let kept = without_task_switcher_entry(tao);
        assert_eq!(kept & WS_EX_APPWINDOW.0, 0);
        assert_ne!(kept & WS_EX_TOOLWINDOW.0, 0);
        assert_eq!(kept & !WS_EX_TOOLWINDOW.0, tao & !WS_EX_APPWINDOW.0);
    }

    #[test]
    fn invalid_windows_are_refused() {
        assert!(!hide_from_task_switcher(HWND::default()));
    }
}
