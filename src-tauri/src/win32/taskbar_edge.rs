//! Where Windows' own taskbars sit, so the island can stay clear of a top-docked one
//! without also yielding to third-party app bars (docks, menu bars) that shrink the
//! work area the same way.

use windows::{
    core::w,
    Win32::{
        Foundation::HWND,
        UI::{
            Shell::{SHAppBarMessage, ABE_TOP, ABM_GETSTATE, ABM_GETTASKBARPOS, ABS_AUTOHIDE, APPBARDATA},
            WindowsAndMessaging::{
                FindWindowExW, SetWindowPos, HWND_TOPMOST, SWP_ASYNCWINDOWPOS, SWP_NOACTIVATE,
                SWP_NOMOVE, SWP_NOSIZE,
            },
        },
    },
};

use super::window::{is_visible, window_rect};

/// A taskbar's screen rectangle in physical pixels: `(left, top, right, bottom)`.
pub(crate) type TaskbarRect = (i32, i32, i32, i32);

/// Rectangles of the Windows taskbars that may be docked to the top of a monitor:
/// the primary one only when the shell reports it on the top edge, and every visible
/// secondary-monitor taskbar (the caller checks which edge those sit on). Empty while
/// the taskbar auto-hides, since an auto-hidden taskbar leaves the work area alone.
pub(crate) fn top_taskbar_candidates() -> Vec<TaskbarRect> {
    if is_auto_hidden() {
        return Vec::new();
    }
    let mut rects = Vec::new();
    if let Some(rect) = primary_top_taskbar() {
        rects.push(rect);
    }
    let mut after: Option<HWND> = None;
    // Bounded so a misbehaving shell can never keep the loop going.
    for _ in 0..16 {
        // SAFETY: FindWindowExW takes the handles by value and static, NUL-terminated strings.
        let Ok(next) = (unsafe { FindWindowExW(None, after, w!("Shell_SecondaryTrayWnd"), None) }) else {
            break;
        };
        if is_visible(next) {
            if let Some(rect) = window_rect(next) {
                rects.push((rect.left, rect.top, rect.right, rect.bottom));
            }
        }
        after = Some(next);
    }
    rects
}

fn appbar_data() -> APPBARDATA {
    APPBARDATA {
        cbSize: std::mem::size_of::<APPBARDATA>() as u32,
        ..Default::default()
    }
}

fn is_auto_hidden() -> bool {
    let mut data = appbar_data();
    // SAFETY: `data` is a valid local with `cbSize` set, as SHAppBarMessage requires.
    let state = unsafe { SHAppBarMessage(ABM_GETSTATE, &mut data) } as u32;
    state & ABS_AUTOHIDE != 0
}

fn primary_top_taskbar() -> Option<TaskbarRect> {
    let mut data = appbar_data();
    // SAFETY: `data` is a valid local with `cbSize` set; the shell fills `uEdge` and `rc`.
    let found = unsafe { SHAppBarMessage(ABM_GETTASKBARPOS, &mut data) } != 0;
    (found && data.uEdge == ABE_TOP).then_some((data.rc.left, data.rc.top, data.rc.right, data.rc.bottom))
}

/// Puts `window` back at the top of the topmost band without moving, resizing or
/// activating it, so an app bar that raised itself later no longer covers it.
/// Posted rather than sent when called off the window's thread, so it never waits.
pub(crate) fn raise_topmost(window: HWND) {
    // SAFETY: SetWindowPos takes the handles by value and fails for an invalid window.
    let _ = unsafe {
        SetWindowPos(
            window,
            Some(HWND_TOPMOST),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS,
        )
    };
}
