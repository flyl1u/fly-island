//! Keyboard focus while the cursor rests on the expanded island. Hovering leaves the
//! focus in the app underneath, so the island's in-window shortcuts (page switching,
//! Escape) would not reach it; the island takes the focus for as long as the cursor
//! is over it and hands it back to that app afterwards.

use std::sync::atomic::{AtomicIsize, Ordering};
use tauri::AppHandle;
use windows::Win32::Foundation::HWND;

use super::main_window;
use crate::win32;

// The window that had the focus before the island took it; 0 when the island holds
// none it should give back.
static PREVIOUS_FOREGROUND: AtomicIsize = AtomicIsize::new(0);

/// Brings the island to the foreground and remembers the window it took the focus
/// from. Does nothing when the island already has it, so a click inside the island
/// never leaves a window to return to.
#[tauri::command]
pub fn take_island_hover_focus(app: AppHandle) -> Result<(), String> {
    let window = main_window(&app)?;
    let island = window.hwnd().map_err(|error| error.to_string())?;
    let foreground = win32::window::foreground_window();
    if foreground == island {
        return Ok(());
    }
    window.set_focus().map_err(|error| error.to_string())?;
    if win32::window::foreground_window() == island && !foreground.is_invalid() {
        PREVIOUS_FOREGROUND.store(foreground.0 as isize, Ordering::SeqCst);
    }
    Ok(())
}

/// Gives the focus back to the window the island took it from, but only while the
/// island still holds it: once the user clicked another window, that one keeps it.
#[tauri::command]
pub fn release_island_hover_focus(app: AppHandle) -> Result<(), String> {
    let previous = PREVIOUS_FOREGROUND.swap(0, Ordering::SeqCst);
    if previous == 0 {
        return Ok(());
    }
    let island = main_window(&app)?.hwnd().map_err(|error| error.to_string())?;
    let previous = HWND(previous as *mut _);
    if win32::window::foreground_window() == island && win32::window::is_visible(previous) {
        win32::window::bring_to_foreground(previous);
    }
    Ok(())
}
