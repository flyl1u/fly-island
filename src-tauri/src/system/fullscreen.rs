//! Watches for a full-screen app (usually a game) in the foreground, for the island's
//! game mode: it stops opening and taking the focus on hover, and can tuck away.

use serde::Serialize;
use std::{sync::Mutex, thread, time::{Duration, Instant}};
use tauri::{AppHandle, Emitter};
use windows::Win32::Foundation::{HWND, RECT};

use super::{
    browser_apps,
    fullscreen_hold::{covers_monitor, decide_own_foreground, HeldWindowFacts, HoldDecision},
};
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
    /// A browser is in the foreground on the island's monitor.
    browser_on_island_monitor: bool,
}

impl ForegroundFullscreen {
    /// A full-screen app fills the island's monitor (the glass capture pauses then).
    pub(crate) fn covers_island(&self) -> bool {
        self.active && self.on_island_monitor
    }
}

static STATE: Mutex<ForegroundFullscreen> = Mutex::new(ForegroundFullscreen {
    active: false,
    on_island_monitor: false,
    browser_on_island_monitor: false,
});

/// Shell windows that can sit in front covering a whole monitor without being an app in
/// full screen: the desktop (after Win+D or a click on it) and the taskbars.
const SHELL_CLASSES: [&str; 4] = ["Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd"];

/// Whether the foreground counts as a full-screen app. The shell's QUNS_BUSY is only a
/// guess, and some machines report it for long stretches with no full-screen app in front
/// (overlays, the desktop, a window that once went full screen), which held back every
/// message preview through game mode. So it must be confirmed by the foreground window
/// itself covering its whole monitor. Presentation settings are the user's own choice.
fn is_fullscreen_foreground(
    signal: win32::notification_state::FullscreenSignal,
    window: Option<RECT>,
    monitor: Option<RECT>,
    class: &str,
) -> bool {
    use win32::notification_state::FullscreenSignal;
    match signal {
        FullscreenSignal::None => false,
        FullscreenSignal::Presentation => true,
        FullscreenSignal::FullscreenApp => {
            !SHELL_CLASSES.contains(&class) && covers_monitor(window, monitor)
        }
    }
}


struct Observation {
    foreground: HWND,
    state: ForegroundFullscreen,
    browser: bool,
    process_id: u32,
    signal: Option<&'static str>,
    covered: Option<bool>,
    /// Why this answer: a normal read, or why an own-window foreground held or cleared it.
    reason: &'static str,
}

impl Observation {
    fn record(&self) {
        use crate::app_log::{event, Category};
        let process = win32::process::image_path(self.process_id).and_then(|path| {
            std::path::Path::new(&path).file_name().map(|name| name.to_string_lossy().into_owned())
        });
        let class = if self.foreground.is_invalid() { String::new() } else { win32::window::class_name(self.foreground) };
        let signal = self.signal.unwrap_or("not_read");
        event(Category::Fullscreen, "foreground", &[
            ("reason", self.reason),
            ("active", &self.state.active.to_string()), ("on_island_monitor", &self.state.on_island_monitor.to_string()),
            ("browser", &self.browser.to_string()),
            ("browser_on_island_monitor", &self.state.browser_on_island_monitor.to_string()),
            ("class", &class), ("process", process.as_deref().unwrap_or("unknown")),
            ("covers_monitor", self.covered.map_or("not_read", |covered| if covered { "true" } else { "false" })),
            ("notification_signal", signal), ("retained", &self.signal.is_none().to_string()),
        ]);
    }
}

/// The window last judged full screen, and since when our own windows have been in front.
#[derive(Default)]
struct Tracker {
    /// The raw handle (the type is not `Send`); only compared and queried, never acted on.
    held: Option<isize>,
    own_since: Option<Instant>,
    browser_window: Option<(isize, u32)>,
    browsers: browser_apps::RegisteredBrowsers,
}

fn held_window(held: isize) -> HWND {
    HWND(held as *mut std::ffi::c_void)
}

fn held_facts(held: isize) -> HeldWindowFacts {
    let window = held_window(held);
    let visible = win32::window::is_visible(window);
    HeldWindowFacts {
        visible,
        minimized: visible && win32::window::is_minimized(window),
        covers_monitor: visible && covers_monitor(win32::window::window_rect(window), win32::window::monitor_rect(window)),
    }
}

fn shares_island_monitor(app: &AppHandle, window: HWND) -> bool {
    island::main_window(app)
        .and_then(|island| island.hwnd().map_err(|error| error.to_string()))
        // When the island cannot be found, assume it shares the screen.
        .map_or(true, |island| win32::window::share_monitor(window, island))
}

fn read(app: &AppHandle, tracker: &mut Tracker) -> Observation {
    tracker.browsers.refresh_if_due();
    let foreground = win32::window::foreground_window();
    let process_id = if foreground.is_invalid() { 0 } else { win32::process::window_process_id(foreground) };
    // One of our own windows in front (the island took the focus, a click on it, the settings
    // window) says nothing about the game behind it. Reading it as "no full screen" ended game
    // mode at the very moment the island got in the game's way, which let hover open the
    // island and take the focus for good (#73). So the last answer is kept while the window
    // judged full screen is still there and covering its monitor; otherwise (it closed, was
    // minimized or shrank, or nothing is remembered for too long) the hold ends, since
    // Windows hands the foreground to the island after a game exits (fullscreen_hold.rs).
    if process_id == std::process::id() {
        let own_for = tracker.own_since.get_or_insert_with(Instant::now).elapsed();
        let previous = get_foreground_fullscreen();
        let facts = tracker.held.map(held_facts);
        let (mut state, reason) = match decide_own_foreground(previous.active, facts, own_for) {
            HoldDecision::Keep => {
                // The held window may sit on another monitor than the island by now.
                let on_island = tracker.held.map_or(previous.on_island_monitor, |held| {
                    previous.active && shares_island_monitor(app, held_window(held))
                });
                (ForegroundFullscreen { active: previous.active, on_island_monitor: on_island, browser_on_island_monitor: false }, "own_process_held")
            }
            HoldDecision::Clear(reason) => {
                tracker.held = None;
                (ForegroundFullscreen::default(), reason)
            }
        };
        tracker.browser_window = tracker.browser_window.filter(|&(handle, pid)| {
            let window = held_window(handle);
            win32::window::is_visible(window) && !win32::window::is_minimized(window)
                && win32::process::window_process_id(window) == pid
        });
        let browser = tracker.browser_window.is_some();
        state.browser_on_island_monitor = tracker.browser_window
            .is_some_and(|(handle, _)| shares_island_monitor(app, held_window(handle)));
        return Observation { foreground, state, browser, process_id, signal: None, covered: facts.map(|facts| facts.covers_monitor), reason };
    }
    tracker.own_since = None;
    let (signal, signal_name) = win32::notification_state::fullscreen_signal();
    let rect = (!foreground.is_invalid() && win32::window::is_visible(foreground))
        .then(|| win32::window::window_rect(foreground)).flatten();
    let monitor = win32::window::monitor_rect(foreground);
    let active = is_fullscreen_foreground(signal, rect, monitor, &win32::window::class_name(foreground));
    let on_island_monitor = active && shares_island_monitor(app, foreground);
    // Only a window the shell's guess is confirmed by is remembered for later.
    tracker.held = (active && matches!(signal, win32::notification_state::FullscreenSignal::FullscreenApp))
        .then_some(foreground.0 as isize);
    let browser = tracker.browsers.contains(win32::process::image_path(process_id).as_deref());
    tracker.browser_window = browser.then_some((foreground.0 as isize, process_id));
    let browser_on_island_monitor = browser && shares_island_monitor(app, foreground);
    Observation { foreground, state: ForegroundFullscreen { active, on_island_monitor, browser_on_island_monitor }, browser, process_id,
        signal: Some(signal_name), covered: Some(covers_monitor(rect, monitor)), reason: "foreground_changed" }
}

pub(crate) fn start(app: &AppHandle) {
    let app = app.clone();
    thread::spawn(move || {
        let mut previous = None;
        let mut tracker = Tracker::default();
        loop {
            let observation = read(&app, &mut tracker);
            let next = observation.state;
            let changed = {
                let mut state = STATE.lock().unwrap_or_else(|poison| poison.into_inner());
                std::mem::replace(&mut *state, next) != next
            };
            if changed {
                let _ = app.emit(FOREGROUND_FULLSCREEN_CHANGED_EVENT, next);
            }
            let evidence = (observation.signal, observation.covered, observation.reason,
                observation.browser, next.browser_on_island_monitor,
                (next.active || observation.browser).then_some(observation.process_id));
            if changed || previous != Some(evidence) { observation.record(); }
            previous = Some(evidence);
            thread::sleep(POLL_INTERVAL);
        }
    });
}

/// The user asked for the island (tray, settings, shortcut): game mode lets go of it at once,
/// whatever the last check said. It comes back by itself when a full-screen app is found in
/// front again at a later check, so returning to the game still quiets the island.
pub(crate) fn end_for_summon(app: &AppHandle) {
    let changed = {
        let mut state = STATE.lock().unwrap_or_else(|poison| poison.into_inner());
        std::mem::take(&mut *state) != ForegroundFullscreen::default()
    };
    if changed {
        crate::app_log::event(crate::app_log::Category::Fullscreen, "foreground", &[("reason", "summoned"), ("active", "false")]);
        let _ = app.emit(FOREGROUND_FULLSCREEN_CHANGED_EVENT, ForegroundFullscreen::default());
    }
}

/// The state at the last check.
#[tauri::command]
pub fn get_foreground_fullscreen() -> ForegroundFullscreen {
    *STATE.lock().unwrap_or_else(|poison| poison.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    use win32::notification_state::FullscreenSignal;

    const MONITOR: RECT = RECT { left: 0, top: 0, right: 1920, bottom: 1080 };

    #[test]
    fn a_window_covering_its_monitor_confirms_the_shell() {
        let covering = RECT { left: -8, top: -8, right: 1928, bottom: 1088 };
        assert!(is_fullscreen_foreground(FullscreenSignal::FullscreenApp, Some(covering), Some(MONITOR), "UnityWndClass"));
        assert!(is_fullscreen_foreground(FullscreenSignal::FullscreenApp, Some(MONITOR), Some(MONITOR), "Chrome_WidgetWin_1"));
    }

    #[test]
    fn a_busy_shell_without_a_full_screen_window_is_not_game_mode() {
        let maximized = RECT { left: 0, top: 0, right: 1920, bottom: 1040 };
        assert!(!is_fullscreen_foreground(FullscreenSignal::FullscreenApp, Some(maximized), Some(MONITOR), "Notepad"));
        assert!(!is_fullscreen_foreground(FullscreenSignal::FullscreenApp, None, Some(MONITOR), "Notepad"));
        for shell in SHELL_CLASSES {
            assert!(!is_fullscreen_foreground(FullscreenSignal::FullscreenApp, Some(MONITOR), Some(MONITOR), shell));
        }
    }

    #[test]
    fn presentation_settings_count_and_a_quiet_shell_never_does() {
        assert!(is_fullscreen_foreground(FullscreenSignal::Presentation, None, None, ""));
        assert!(!is_fullscreen_foreground(FullscreenSignal::None, Some(MONITOR), Some(MONITOR), "UnityWndClass"));
    }
}
