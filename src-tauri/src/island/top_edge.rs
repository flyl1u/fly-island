//! Tracks whether the island sits flush with the top edge of its monitor. While it
//! does, the frontend draws a flat top whose corners flare into the screen edge.

use tauri::{Emitter, PhysicalPosition, Position, WebviewWindow};

use super::geometry::{monitor_for_island_position, work_area_top_inset};
use super::state::{mutate_window_state, read_window_state, IslandPosition, IslandWindowState};

// Mirrored by TOP_ATTACHMENT_CHANGED_EVENT in src/windows/island/api.ts.
pub(crate) const TOP_ATTACHMENT_CHANGED_EVENT: &str = "island-top-attachment-changed";
// Dropping the island this close to the top edge (logical px) pulls it flush.
const SNAP_DISTANCE: f64 = 16.0;

pub(crate) fn is_attached() -> bool {
    read_window_state().top_attached
}

/// Recomputes the attachment once the stage geometry has resolved the window position.
/// `top` is the physical y of the monitor top, below a top-docked taskbar.
pub(crate) fn sync_from_stage(window: &WebviewWindow, state: IslandWindowState, top: i32) {
    set_attached(
        window,
        is_top_attached(state.custom_position, state.margin_y, top),
    );
}

/// Pulls a dropped island flush with the top edge when it lands close to it.
pub(crate) fn snap_to_top(window: &WebviewWindow, position: IslandPosition) -> IslandPosition {
    let Ok(Some(monitor)) = monitor_for_island_position(window, position, read_window_state()) else {
        set_attached(window, false);
        return position;
    };
    let monitor_top = monitor.position().y;
    let top = monitor_top + work_area_top_inset(monitor_top, monitor.work_area().position.y);
    let snap_distance = (SNAP_DISTANCE * monitor.scale_factor()).round() as i32;
    let snapped = IslandPosition {
        x: position.x,
        y: snapped_y(position.y, top, snap_distance),
    };

    if snapped != position {
        let target = Position::Physical(PhysicalPosition::new(snapped.x, snapped.y));
        if let Err(error) = window.set_position(target) {
            eprintln!("Failed to snap island to the top edge: {error}");
            set_attached(window, position.y == top);
            return position;
        }
    }

    set_attached(window, snapped.y == top);
    snapped
}

pub(crate) fn set_attached(window: &WebviewWindow, attached: bool) {
    let mut changed = false;
    mutate_window_state(|state| {
        changed = state.top_attached != attached;
        state.top_attached = attached;
        *state
    });

    if changed {
        let _ = window.emit(TOP_ATTACHMENT_CHANGED_EVENT, attached);
    }
}

// A custom position ignores the vertical margin, so only its own y decides.
fn is_top_attached(custom_position: Option<IslandPosition>, margin_y: f64, top: i32) -> bool {
    match custom_position {
        Some(position) => position.y == top,
        None => margin_y <= 0.0,
    }
}

fn snapped_y(y: i32, top: i32, snap_distance: i32) -> i32 {
    if (y - top).abs() <= snap_distance {
        top
    } else {
        y
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_position_is_attached_only_without_a_margin() {
        assert!(is_top_attached(None, 0.0, 0));
        assert!(is_top_attached(None, 0.0, 48));
        assert!(!is_top_attached(None, 12.0, 0));
    }

    #[test]
    fn custom_position_is_attached_only_when_flush_with_the_top() {
        let at = |y| Some(IslandPosition { x: 420, y });
        assert!(is_top_attached(at(0), 0.0, 0));
        assert!(is_top_attached(at(0), 40.0, 0));
        assert!(is_top_attached(at(-1080), 0.0, -1080));
        assert!(is_top_attached(at(48), 0.0, 48));
        assert!(!is_top_attached(at(1), 0.0, 0));
        assert!(!is_top_attached(at(180), 0.0, 0));
        assert!(!is_top_attached(at(0), 0.0, 48));
    }

    #[test]
    fn drops_near_the_top_snap_flush_and_others_stay() {
        assert_eq!(snapped_y(0, 0, 16), 0);
        assert_eq!(snapped_y(16, 0, 16), 0);
        assert_eq!(snapped_y(-16, 0, 16), 0);
        assert_eq!(snapped_y(17, 0, 16), 17);
        assert_eq!(snapped_y(-17, 0, 16), -17);
        assert_eq!(snapped_y(-1070, -1080, 24), -1080);
        assert_eq!(snapped_y(60, 48, 24), 48);
        assert_eq!(snapped_y(300, 48, 24), 300);
    }
}
