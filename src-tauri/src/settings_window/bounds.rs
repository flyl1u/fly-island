//! The settings window's last place, saved when it closes and used the next time it
//! opens, as long as that place is still on a screen. The size is saved too but no
//! longer read back: the window always opens at its configured size.

use serde::{Deserialize, Serialize};
use std::fs;
use tauri::{AppHandle, Manager, Monitor, WebviewWindow};

const BOUNDS_FILE_NAME: &str = "settings-window.json";

/// How much of the title bar, from its left end, must lie on a screen's work area
/// for a saved position to be reused; less than that and the window could not be grabbed.
const GRAB_WIDTH: i32 = 120;
const GRAB_HEIGHT: i32 = 24;

/// Position in physical pixels (it may sit on a monitor with another scale), size in
/// logical pixels like the window config.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub(super) struct SavedBounds {
    pub x: i32,
    pub y: i32,
    pub width: f64,
    pub height: f64,
}

/// A screen's work area in physical pixels: left, top, width, height.
pub(super) type WorkArea = (i32, i32, u32, u32);

pub(super) fn load(app: &AppHandle) -> Option<SavedBounds> {
    let path = app.path().app_data_dir().ok()?.join(BOUNDS_FILE_NAME);
    let bounds: SavedBounds = serde_json::from_str(&fs::read_to_string(path).ok()?).ok()?;
    (bounds.width.is_finite() && bounds.height.is_finite()).then_some(bounds)
}

/// Saves where the window is now. A minimized or maximized window is skipped so the
/// last normal size and place are kept.
pub(super) fn save(window: &WebviewWindow) {
    if window.is_minimized().unwrap_or(true) || window.is_maximized().unwrap_or(true) {
        return;
    }
    let (Ok(position), Ok(size), Ok(scale)) = (
        window.outer_position(),
        window.inner_size(),
        window.scale_factor(),
    ) else {
        return;
    };
    let size = size.to_logical::<f64>(scale);
    let bounds = SavedBounds {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    };
    let Ok(directory) = window.app_handle().path().app_data_dir() else {
        return;
    };
    let Ok(json) = serde_json::to_string(&bounds) else {
        return;
    };
    if fs::create_dir_all(&directory).is_ok() {
        let _ = fs::write(directory.join(BOUNDS_FILE_NAME), json);
    }
}

/// The screen a saved window goes back to: the one its title bar is on. None when
/// that place is off every screen now (a monitor was unplugged or rearranged).
pub(super) fn screen_of(bounds: SavedBounds, monitors: &[Monitor]) -> Option<&Monitor> {
    monitors.iter().find(|monitor| {
        let area = monitor.work_area();
        let area = (
            area.position.x,
            area.position.y,
            area.size.width,
            area.size.height,
        );
        title_bar_on_screen(bounds.x, bounds.y, &[area])
    })
}

pub(super) fn title_bar_on_screen(x: i32, y: i32, areas: &[WorkArea]) -> bool {
    areas.iter().any(|&(left, top, width, height)| {
        let right = left.saturating_add(i32::try_from(width).unwrap_or(i32::MAX));
        let bottom = top.saturating_add(i32::try_from(height).unwrap_or(i32::MAX));
        x >= left
            && y >= top
            && x.saturating_add(GRAB_WIDTH) <= right
            && y.saturating_add(GRAB_HEIGHT) <= bottom
    })
}
