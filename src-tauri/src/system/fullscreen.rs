//! Watches for a full-screen app (usually a game) in the foreground, for the island's
//! game mode: it stops opening and taking the focus on hover, and can tuck away.

use std::{
    sync::atomic::{AtomicBool, Ordering},
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter};

use crate::win32;

// Mirrored by FOREGROUND_FULLSCREEN_CHANGED_EVENT in src/windows/island/api.ts. The
// payload says whether a full-screen app is now in the foreground.
pub(crate) const FOREGROUND_FULLSCREEN_CHANGED_EVENT: &str = "foreground-fullscreen-changed";

// Slow enough to cost nothing, quick enough that the island is out of the way soon
// after a game starts.
const POLL_INTERVAL: Duration = Duration::from_millis(800);

static FULLSCREEN: AtomicBool = AtomicBool::new(false);

pub(crate) fn start(app: &AppHandle) {
    let app = app.clone();
    thread::spawn(move || loop {
        let fullscreen = win32::notification_state::fullscreen_app_in_front();
        if FULLSCREEN.swap(fullscreen, Ordering::SeqCst) != fullscreen {
            let _ = app.emit(FOREGROUND_FULLSCREEN_CHANGED_EVENT, fullscreen);
        }
        thread::sleep(POLL_INTERVAL);
    });
}

/// Whether a full-screen app was in the foreground at the last check.
#[tauri::command]
pub fn get_foreground_fullscreen() -> bool {
    FULLSCREEN.load(Ordering::SeqCst)
}
