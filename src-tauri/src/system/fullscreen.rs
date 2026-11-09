//! Watches for a full-screen app (usually a game) in the foreground, for the island's
//! game mode: it stops opening and taking the focus on hover, and can tuck away.

use serde::Serialize;
use std::{sync::Mutex, thread, time::Duration};
use tauri::{AppHandle, Emitter};

use crate::{island, win32};

// Mirrored by FOREGROUND_FULLSCREEN_CHANGED_EVENT in src/windows/island/api.ts. The
// payload is a ForegroundFullscreen.
pub(crate) const FOREGROUND_FULLSCREEN_CHANGED_EVENT: &str = "foreground-fullscreen-changed";

// Slow enough to cost nothing, quick enough that the island is out of the way soon
// after a game starts.
const POLL_INTERVAL: Duration = Duration::from_millis(800);

/// Mirrored by ForegroundFullscreen in src/windows/island/api.ts.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundFullscreen {
    /// A full-screen app (game, full-screen video, slides) is in the foreground.
    active: bool,
    /// It fills the monitor the island is on, so the island sits over it.
    on_island_monitor: bool,
}

static STATE: Mutex<ForegroundFullscreen> = Mutex::new(ForegroundFullscreen {
    active: false,
    on_island_monitor: false,
});

fn read(app: &AppHandle) -> ForegroundFullscreen {
    let active = win32::notification_state::fullscreen_app_in_front();
    let on_island_monitor = active
        && island::main_window(app)
            .and_then(|window| window.hwnd().map_err(|error| error.to_string()))
            // When the island cannot be found, assume it shares the screen.
            .map_or(true, |island| {
                win32::window::share_monitor(win32::window::foreground_window(), island)
            });
    ForegroundFullscreen { active, on_island_monitor }
}

pub(crate) fn start(app: &AppHandle) {
    let app = app.clone();
    thread::spawn(move || loop {
        let next = read(&app);
        let changed = {
            let mut state = STATE.lock().unwrap_or_else(|poison| poison.into_inner());
            std::mem::replace(&mut *state, next) != next
        };
        if changed {
            let _ = app.emit(FOREGROUND_FULLSCREEN_CHANGED_EVENT, next);
        }
        thread::sleep(POLL_INTERVAL);
    });
}

/// The state at the last check.
#[tauri::command]
pub fn get_foreground_fullscreen() -> ForegroundFullscreen {
    *STATE.lock().unwrap_or_else(|poison| poison.into_inner())
}
