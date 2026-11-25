//! Lets clicks fall through the transparent stage everywhere outside the island shape.

use std::{thread, time::Duration};
use tauri::{Emitter, WebviewWindow};
use windows::Win32::Foundation::HWND;

use super::{
    corridor::PeekCorridor,
    geometry::{is_position_animating, tucked_top_offset, STAGE_WINDOW_WIDTH},
    state::{game_quiet, read_window_state, CornerShape, IslandMode, IslandWindowState},
};
use crate::win32;

/// Logical px beside the collapsed bar that still count as on it, before the island scale.
const COLLAPSED_HIT_SLOP: f64 = 4.0;

// Mirrored by ISLAND_HOVER_CHANGED_EVENT in src/windows/island/api.ts. The payload says
// whether the cursor is over the island shape. The webview's own mouseleave is unreliable
// here, because the window stops receiving the cursor as soon as it leaves the shape.
pub(crate) const ISLAND_HOVER_CHANGED_EVENT: &str = "island-hover-changed";

pub(crate) fn start_cursor_passthrough_loop(window: WebviewWindow) {
    thread::spawn(move || {
        let mut ignoring_cursor = false;
        let mut was_inside = false;
        let mut corridor = PeekCorridor::default();
        // Asked once: every `window.hwnd()` is a round trip to the main event loop, which at
        // this loop's 83 Hz kept the main thread busy even with the cursor nowhere near. The
        // handle stays the same for the window's life.
        let hwnd = window.hwnd().ok();

        loop {
            // Hidden (tray) or mid-slide: the window is not under the cursor in any meaningful
            // way. A slide moves it out from under a cursor that has not moved, which must not
            // read as leaving (peek, retract, peek again). Based on a contributor patch.
            if let Some(hwnd) = hwnd {
                if !win32::window::is_visible(hwnd) {
                    if !ignoring_cursor && window.set_ignore_cursor_events(true).is_ok() {
                        ignoring_cursor = true;
                    }
                    if was_inside {
                        was_inside = false;
                        crate::app_log::event(crate::app_log::Category::Island, "hover", &[("reason", "window_hidden")]);
                        let _ = window.emit(ISLAND_HOVER_CHANGED_EVENT, false);
                    }
                    thread::sleep(Duration::from_millis(40));
                    continue;
                }
                if is_position_animating() {
                    thread::sleep(Duration::from_millis(12));
                    continue;
                }
            }
            // A press that started on the island (selecting text, dragging a slider or a
            // scrollbar) keeps the window taking the mouse until it is released: passing clicks
            // through mid-drag ended the gesture and dropped the selection being made.
            let in_shape = hwnd.is_none_or(cursor_is_inside_island)
                || (!ignoring_cursor && win32::input::is_left_button_down());
            // Between the tucked line and the island that slid out from it the cursor still
            // counts as hovering, but clicks keep falling through (corridor.rs).
            let in_corridor = hwnd.is_some_and(|hwnd| corridor_hit(&mut corridor, hwnd, in_shape));
            let is_inside = in_shape || in_corridor;
            let should_ignore = !in_shape;

            if should_ignore != ignoring_cursor
                && window.set_ignore_cursor_events(should_ignore).is_ok()
            {
                ignoring_cursor = should_ignore;
            }

            if is_inside != was_inside {
                was_inside = is_inside;
                crate::app_log::event(crate::app_log::Category::Island, "hover", &[("reason", if is_inside { "cursor_enter" } else { "cursor_leave" })]);
                let _ = window.emit(ISLAND_HOVER_CHANGED_EVENT, is_inside);
                // Once per hover: a dock that raised itself over the island gives way. Not over
                // a game: reordering topmost windows there can knock it out of full screen.
                if let Some(hwnd) = hwnd.filter(|_| is_inside && !game_quiet()) {
                    win32::taskbar_edge::raise_topmost(hwnd);
                }
            }

            thread::sleep(Duration::from_millis(12));
        }
    });
}

/// Feeds the corridor tracker the window and cursor now; whether the corridor holds the cursor.
fn corridor_hit(corridor: &mut PeekCorridor, hwnd: HWND, in_shape: bool) -> bool {
    let (Some(window_rect), Some(cursor)) = (win32::window::window_rect(hwnd), win32::window::cursor_position()) else {
        return false;
    };
    let window_width = f64::from(window_rect.right - window_rect.left).max(1.0);
    let (hit, change) = corridor.observe(
        read_window_state(),
        (f64::from(window_rect.left), f64::from(window_rect.top)),
        window_width / STAGE_WINDOW_WIDTH,
        (f64::from(cursor.x), f64::from(cursor.y)),
        in_shape,
    );
    if let Some(reason) = change.reason() {
        crate::app_log::event(crate::app_log::Category::Island, "hover_corridor", &[("reason", reason)]);
    }
    hit
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
    // Tucked over a game: the edge strip lets everything through, so the cursor reaching the
    // top of the screen never brings the island out or activates it (#73).
    if state.is_tucked && game_quiet() {
        return false;
    }

    point_in_island(state, physical_scale, local_x, local_y)
}

/// Physical stage coordinates, shared by the live cursor loop and the DPI tests.
pub(super) fn point_in_island(state: IslandWindowState, physical_scale: f64, local_x: f64, local_y: f64) -> bool {
    let window_width = STAGE_WINDOW_WIDTH * physical_scale;
    // A game-mode message preview is only shown: the cursor goes on to the game.
    if state.click_through {
        return false;
    }
    if let Some((width, height)) = state.tuck_style.hot_zone_size().filter(|_| state.is_tucked) {
        let scale = state.collapsed_scale * physical_scale;
        let left = (window_width - width * scale) / 2.0;
        // Line keeps the stage at the work-area top; hidden slides it up. The rounded native
        // offset makes the hot zone start exactly at the screen edge either way.
        let top = -f64::from(tucked_top_offset(state, physical_scale));
        return local_x >= left && local_x < left + width * scale
            && local_y >= top && local_y < top + height * scale;
    }

    let (logical_width, logical_height) = state.active_size();
    let island_width = logical_width * physical_scale;
    let island_height = logical_height * physical_scale;
    let island_left = (window_width - island_width) / 2.0;
    let island_top = 0.0;
    let radius = state.bottom_corner_radius() * state.active_scale() * physical_scale;
    let top_radius = state.top_corner_radius() * state.active_scale() * physical_scale;

    // The collapsed bar takes its whole box and a little beside it, rounded corners included. The
    // first button and the last sit in those corners, and some users found the left half of the
    // Agent icon and the minimize button did nothing (2026-11-19): with the corners cut exactly,
    // a click a pixel or two off the curve fell through to the window behind.
    if matches!(state.mode, IslandMode::Collapsed) && !state.is_tucked {
        let slop = COLLAPSED_HIT_SLOP * state.active_scale() * physical_scale;
        if local_x >= island_left - slop
            && local_x <= island_left + island_width + slop
            && local_y >= island_top
            && local_y <= island_top + island_height
        {
            return true;
        }
    }

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
