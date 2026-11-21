//! Rest webviews stay beneath visible, already-topmost host windows, including during activation.
use std::sync::Arc;
use windows::{
    core::BOOL,
    Win32::{
        Foundation::{HWND, LPARAM, LRESULT, WPARAM},
        UI::{
            Shell::{DefSubclassProc, GetWindowSubclass, RemoveWindowSubclass, SetWindowSubclass},
            WindowsAndMessaging::{
                EnumWindows, GetForegroundWindow, GetWindowLongW, GetWindowThreadProcessId,
                IsIconic, IsWindowVisible, SetForegroundWindow, SetWindowPos, GWL_EXSTYLE,
                HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SWP_SHOWWINDOW,
                WINDOWPOS, WM_NCDESTROY, WM_WINDOWPOSCHANGING, WS_EX_TOPMOST,
            },
        },
    },
};

const SUBCLASS_ID: usize = 0x4559_4552;
struct Context {
    overlays: Arc<Vec<isize>>,
}

fn is_host_surface(
    process: u32,
    visible: bool,
    minimized: bool,
    topmost: bool,
    overlay: bool,
) -> bool {
    process == std::process::id() && visible && !minimized && topmost && !overlay
}

fn eligible(hwnd: HWND, overlays: &[isize]) -> bool {
    if overlays.contains(&(hwnd.0 as isize)) {
        return false;
    }
    let mut process = 0;
    // SAFETY: read-only queries; null/stale handles fail with an empty result.
    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut process));
        is_host_surface(
            process,
            IsWindowVisible(hwnd).as_bool(),
            IsIconic(hwnd).as_bool(),
            GetWindowLongW(hwnd, GWL_EXSTYLE) as u32 & WS_EX_TOPMOST.0 != 0,
            false,
        )
    }
}

fn anchor(overlays: &[isize]) -> HWND {
    struct Search<'a> {
        overlays: &'a [isize],
        last: HWND,
    }
    unsafe extern "system" fn visit(hwnd: HWND, param: LPARAM) -> BOOL {
        // SAFETY: EnumWindows borrows the live Search synchronously.
        let search = unsafe { &mut *(param.0 as *mut Search<'_>) };
        if eligible(hwnd, search.overlays) {
            search.last = hwnd;
        }
        BOOL(1)
    }
    let mut search = Search {
        overlays,
        last: HWND_TOPMOST,
    };
    // SAFETY: callback and context remain live until enumeration returns.
    let _ = unsafe { EnumWindows(Some(visit), LPARAM(&mut search as *mut Search<'_> as isize)) };
    search.last
}

unsafe extern "system" fn subclass(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    data: usize,
) -> LRESULT {
    // SAFETY: protect transfers this box to the subclass until WM_NCDESTROY.
    let context = unsafe { &*(data as *const Context) };
    if message == WM_WINDOWPOSCHANGING && lparam.0 != 0 {
        // SAFETY: Windows supplies a writable WINDOWPOS for this message only.
        let position = unsafe { &mut *(lparam.0 as *mut WINDOWPOS) };
        if !position.flags.contains(SWP_NOZORDER) {
            let after = anchor(&context.overlays);
            if after != HWND_TOPMOST {
                position.hwndInsertAfter = after;
            }
        }
    }
    if message == WM_NCDESTROY {
        // SAFETY: remove before releasing the one owned context, then forward unchanged arguments.
        unsafe {
            let _ = RemoveWindowSubclass(hwnd, Some(subclass), SUBCLASS_ID);
            let result = DefSubclassProc(hwnd, message, wparam, lparam);
            drop(Box::from_raw(data as *mut Context));
            return result;
        }
    }
    // SAFETY: forwards exactly the system-provided message arguments.
    unsafe { DefSubclassProc(hwnd, message, wparam, lparam) }
}

/// Run once on each window's owning UI thread, before showing any rest window.
fn protect(hwnd: HWND, overlays: Arc<Vec<isize>>) -> Result<(), String> {
    // SAFETY: querying an existing subclass does not borrow or transfer a context.
    if unsafe { GetWindowSubclass(hwnd, Some(subclass), SUBCLASS_ID, None) }.as_bool() {
        return Ok(());
    }
    let context = Box::into_raw(Box::new(Context { overlays }));
    // SAFETY: this UI thread owns hwnd. On success WM_NCDESTROY takes responsibility for the box.
    if !unsafe { SetWindowSubclass(hwnd, Some(subclass), SUBCLASS_ID, context as usize) }.as_bool()
    {
        // SAFETY: registration failed, so no callback owns or references this allocation.
        unsafe {
            drop(Box::from_raw(context));
        }
        return Err("Could not protect rest-window layering".into());
    }
    if !super::task_switcher::hide_from_task_switcher(hwnd) {
        return Err("Could not hide rest window from the task switcher".into());
    }
    Ok(())
}

pub(crate) fn protect_all(windows: &[HWND]) -> Result<(), String> {
    let excluded = Arc::new(windows.iter().map(|hwnd| hwnd.0 as isize).collect());
    for hwnd in windows {
        protect(*hwnd, Arc::clone(&excluded))?;
    }
    Ok(())
}

pub(crate) fn reveal(windows: &[HWND]) -> Result<(), String> {
    let excluded: Vec<isize> = windows.iter().map(|hwnd| hwnd.0 as isize).collect();
    // SAFETY: only reads the current foreground window; no focus changes occur here.
    let foreground = unsafe { GetForegroundWindow() };
    let keep_focus = eligible(foreground, &excluded) || excluded.contains(&(foreground.0 as isize));
    for hwnd in windows {
        // SAFETY: these are owned live rest windows; positioning never changes host window flags.
        unsafe {
            SetWindowPos(
                *hwnd,
                Some(anchor(&excluded)),
                0,
                0,
                0,
                0,
                SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
            )
        }
        .map_err(|error| error.to_string())?;
    }
    if !keep_focus {
        if let Some(first) = windows.first() {
            // SAFETY: focuses only our rest window; its subclass constrains activation's Z-order.
            let _ = unsafe { SetForegroundWindow(*first) };
        }
    }
    Ok(())
}

/// Catch newly revealed host windows without changing focus or visibility.
pub(crate) fn maintain_order(windows: &[HWND]) -> Result<(), String> {
    let excluded: Vec<isize> = windows.iter().map(|hwnd| hwnd.0 as isize).collect();
    let after = anchor(&excluded);
    for hwnd in windows {
        // SAFETY: only reorders owned rest windows; never changes size, visibility or focus.
        unsafe {
            SetWindowPos(
                *hwnd,
                Some(after),
                0,
                0,
                0,
                0,
                SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE,
            )
        }
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::is_host_surface;

    #[test]
    fn hidden_minimized_unpinned_foreign_and_rest_windows_cannot_be_host_anchors() {
        let process = std::process::id();
        assert!(is_host_surface(process, true, false, true, false));
        assert!(!is_host_surface(process, false, false, true, false));
        assert!(!is_host_surface(process, true, true, true, false));
        assert!(!is_host_surface(process, true, false, false, false));
        assert!(!is_host_surface(process, true, false, true, true));
        assert!(!is_host_surface(0, true, false, true, false));
    }
}
