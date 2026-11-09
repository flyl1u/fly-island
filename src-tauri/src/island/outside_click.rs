//! Noticing a mouse press outside the island window (roadmap B6.5.3), so an alert that opened the
//! island closes when the user clicks elsewhere. The island window never hears such a press, and a
//! global mouse hook would sit in every click on the desktop; instead, only while the front end
//! asks (an alert is showing, a few seconds), a thread looks at the buttons and the cursor every
//! 40 ms. A press shorter than that can be missed, which only means the alert closes on its timer.

use std::{
    sync::atomic::{AtomicU64, Ordering},
    thread,
    time::Duration,
};

use tauri::{AppHandle, Emitter};
use windows::Win32::Foundation::{HWND, POINT, RECT};

use super::{main_window, WINDOW_LABEL};
use crate::win32;

/// Mirrored by OUTSIDE_CLICK_EVENT in src/windows/island/api.ts.
const OUTSIDE_CLICK_EVENT: &str = "island-outside-click";
const POLL_INTERVAL: Duration = Duration::from_millis(40);
/// Watching stops by itself after this long, should the front end never say stop.
const MAX_WATCH: Duration = Duration::from_secs(120);

/// Bumped by every start and stop; a watching thread ends once it no longer matches.
static GENERATION: AtomicU64 = AtomicU64::new(0);

/// Whether a button went down between two looks with the cursor outside `rect`.
pub(super) fn pressed_outside(was_down: bool, is_down: bool, cursor: POINT, rect: RECT) -> bool {
    let inside = cursor.x >= rect.left && cursor.x < rect.right && cursor.y >= rect.top && cursor.y < rect.bottom;
    !was_down && is_down && !inside
}

/// Starts (`watch` true) or stops looking for presses outside the island; each press found is sent
/// to the island window as `island-outside-click`.
#[tauri::command]
pub async fn set_island_outside_click_watch(app: AppHandle, watch: bool) -> Result<(), String> {
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    if !watch {
        return Ok(());
    }
    let window = main_window(&app)?.hwnd().map_err(|error| error.to_string())?;
    let window = window.0 as isize;
    thread::Builder::new()
        .name("island-outside-click".into())
        .spawn(move || watch_presses(&app, HWND(window as *mut _), generation))
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn watch_presses(app: &AppHandle, window: HWND, generation: u64) {
    // A button already held (the click that is showing the alert, say) is not a new press.
    let mut was_down = win32::input::is_any_button_down();
    let polls = MAX_WATCH.as_millis() / POLL_INTERVAL.as_millis();
    for _ in 0..polls {
        thread::sleep(POLL_INTERVAL);
        if GENERATION.load(Ordering::SeqCst) != generation {
            return;
        }
        let is_down = win32::input::is_any_button_down();
        let outside = match (win32::window::cursor_position(), win32::window::window_rect(window)) {
            (Some(cursor), Some(rect)) => pressed_outside(was_down, is_down, cursor, rect),
            _ => false,
        };
        was_down = is_down;
        if outside {
            let _ = app.emit_to(WINDOW_LABEL, OUTSIDE_CLICK_EVENT, ());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const WINDOW: RECT = RECT { left: 100, top: 0, right: 500, bottom: 200 };

    #[test]
    fn only_a_new_press_outside_the_window_counts() {
        let outside = POINT { x: 50, y: 50 };
        let inside = POINT { x: 300, y: 50 };
        assert!(pressed_outside(false, true, outside, WINDOW));
        assert!(!pressed_outside(false, true, inside, WINDOW));
        assert!(!pressed_outside(true, true, outside, WINDOW), "a held button is no new press");
        assert!(!pressed_outside(true, false, outside, WINDOW), "letting go is no press");
        assert!(pressed_outside(false, true, POINT { x: 500, y: 50 }, WINDOW), "the right edge is outside");
    }
}
