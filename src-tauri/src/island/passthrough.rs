//! Lets clicks fall through the transparent stage everywhere outside the island shape.

use std::{thread, time::Duration};
use tauri::{Emitter, WebviewWindow};
use windows::Win32::Foundation::HWND;

use super::{
    geometry::STAGE_WINDOW_WIDTH,
    state::{read_window_state, CornerShape},
};
use crate::win32;

// Mirrored by ISLAND_HOVER_CHANGED_EVENT in src/windows/island/api.ts. The payload says
// whether the cursor is over the island shape. The webview's own mouseleave is unreliable
// here, because the window stops receiving the cursor as soon as it leaves the shape.
pub(crate) const ISLAND_HOVER_CHANGED_EVENT: &str = "island-hover-changed";

pub(crate) fn start_cursor_passthrough_loop(window: WebviewWindow) {
    thread::spawn(move || {
        let mut ignoring_cursor = false;
        let mut was_inside = false;
        // Asked once: every `window.hwnd()` is a round trip to the main event loop, which at
        // this loop's 83 Hz kept the main thread busy even with the cursor nowhere near. The
        // handle stays the same for the window's life.
        let hwnd = window.hwnd().ok();

        loop {
            let is_inside = hwnd.is_none_or(cursor_is_inside_island);
            let should_ignore = !is_inside;

            if should_ignore != ignoring_cursor
                && window.set_ignore_cursor_events(should_ignore).is_ok()
            {
                ignoring_cursor = should_ignore;
            }

            if is_inside != was_inside {
                was_inside = is_inside;
                let _ = window.emit(ISLAND_HOVER_CHANGED_EVENT, is_inside);
            }

            thread::sleep(Duration::from_millis(12));
        }
    });
}

pub(super) fn cursor_is_inside_island(hwnd: HWND) -> bool {
    let Some(window_rect) = win32::window::window_rect(hwnd) else {
        return true;
    };
    let Some(cursor) = win32::window::cursor_position() else {
        return true;
    };

    let window_width = (window_rect.right - window_rect.left).max(1) as f64;
    let physical_scale = window_width / STAGE_WINDOW_WIDTH;
    let local_x = (cursor.x - window_rect.left) as f64;
    let local_y = (cursor.y - window_rect.top) as f64;
    let state = read_window_state();

    let (base_width, base_height) = state
        .mode
        .base_size(state.collapsed_width, state.expanded_height);
    let island_width = base_width * state.active_scale() * physical_scale;
    let island_height = base_height * state.active_scale() * physical_scale;
    let island_left = (window_width - island_width) / 2.0;
    let island_top = 0.0;
    let radius = state.bottom_corner_radius() * state.active_scale() * physical_scale;
    let top_radius = state.top_corner_radius() * state.active_scale() * physical_scale;

    point_in_notch(
        local_x,
        local_y,
        island_left,
        island_top,
        island_width,
        island_height,
        radius,
        top_radius,
        state.corner_shape,
    )
}

#[expect(
    clippy::too_many_arguments,
    reason = "a point and the notch's rectangle, two radii and their shape, all plain values"
)]
pub(super) fn point_in_notch(
    x: f64,
    y: f64,
    left: f64,
    top: f64,
    width: f64,
    height: f64,
    radius: f64,
    top_radius: f64,
    shape: CornerShape,
) -> bool {
    let right = left + width;
    let bottom = top + height;

    if x < left || x > right || y < top || y > bottom {
        return false;
    }

    // As CSS does, corners that would overlap shrink in proportion: a floating collapsed bar
    // shorter than its two radii becomes a pill.
    let (radius, top_radius) = {
        let fit = (height / (radius + top_radius)).min(1.0);
        (radius * fit, top_radius * fit)
    };
    let top_radius = top_radius.min(width / 2.0);
    if y < top + top_radius && (x < left + top_radius || x > right - top_radius) {
        let dx = x - x.clamp(left + top_radius, right - top_radius);
        let dy = y - (top + top_radius);
        return shape.contains(dx, dy, top_radius);
    }

    let radius = radius.min(width / 2.0).min(height);
    if y <= bottom - radius || (x >= left + radius && x <= right - radius) {
        return true;
    }
    let center_x = if x < left + radius {
        left + radius
    } else if x > right - radius {
        right - radius
    } else {
        x
    };
    let center_y = y.min(bottom - radius);
    let dx = x - center_x;
    let dy = y - center_y;

    shape.contains(dx, dy, radius)
}
