//! Optional music shortcuts, owned by a message-only window independently of the island UI.

use serde::{Deserialize, Serialize};
use std::{collections::{BTreeMap, HashSet}, sync::{Mutex, MutexGuard, OnceLock, PoisonError}, thread};
use tauri::{AppHandle, Emitter};
use windows::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, WPARAM},
    UI::WindowsAndMessaging::{WM_APP, WM_HOTKEY},
};

use super::service::{self, MediaCommand};
use crate::{clipboard_history::parse_shortcut_binding, win32::{hotkey, message_window::{self, WindowMessages}}};

// Mirrored in src/features/media/api.ts.
const STATUS_EVENT: &str = "media-shortcut-status";
const REFRESH_MESSAGE: u32 = WM_APP + 0x64;
const FIRST_ID: i32 = 0x5400;
const CLASS_NAME: &str = "FlyIslandMediaHotkeys";
const ACTIONS: [(&str, MediaCommand); 3] = [
    ("playPause", MediaCommand::PlayPause),
    ("previous", MediaCommand::Previous),
    ("next", MediaCommand::Next),
];

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct MediaShortcuts {
    play_pause: String,
    previous: String,
    next: String,
}

impl MediaShortcuts {
    fn values(&self) -> [&str; 3] {
        [&self.play_pause, &self.previous, &self.next]
    }
}

pub type ShortcutErrors = BTreeMap<String, String>;

#[derive(Default)]
struct State {
    app: Option<AppHandle>,
    window: Option<isize>,
    started: bool,
    enabled: bool,
    wanted: MediaShortcuts,
    target: Option<String>,
    registered: [bool; 3],
    errors: ShortcutErrors,
}

fn state() -> MutexGuard<'static, State> {
    static STATE: OnceLock<Mutex<State>> = OnceLock::new();
    STATE.get_or_init(Mutex::default).lock().unwrap_or_else(PoisonError::into_inner)
}

#[tauri::command]
pub fn get_media_shortcut_errors() -> Result<ShortcutErrors, String> {
    Ok(state().errors.clone())
}

/// The main webview supplies saved keys at startup and whenever their storage changes.
#[tauri::command]
pub async fn set_media_shortcuts(app: AppHandle, enabled: bool, shortcuts: MediaShortcuts, target: Option<String>) -> Result<(), String> {
    let (window, start) = {
        let mut state = state();
        state.app = Some(app);
        state.enabled = enabled;
        state.wanted = shortcuts;
        state.target = target;
        let start = !state.started && enabled && state.wanted.values().iter().any(|key| !key.trim().is_empty());
        state.started |= start;
        (state.window, start)
    };
    if start {
        thread::Builder::new().name("media-hotkeys".into()).spawn(|| {
            if let Err(error) = run_window() {
                let mut state = state();
                state.started = false;
                state.window = None;
                state.errors = state.wanted.values().iter().enumerate()
                    .filter(|(_, key)| !key.trim().is_empty())
                    .map(|(index, _)| (ACTIONS[index].0.to_string(), error.clone())).collect();
                publish(&state);
            }
        }).map_err(|error| {
            state().started = false;
            format!("Failed to start the music shortcut thread: {error}")
        })?;
    } else if let Some(window) = window {
        message_window::post_message(HWND(window as *mut _), REFRESH_MESSAGE)
            .map_err(|error| format!("Failed to update music shortcuts: {error}"))?;
    } else if !state().started {
        let mut state = state();
        state.errors.clear();
        publish(&state);
    }
    Ok(())
}

fn publish(state: &State) {
    if let Some(app) = &state.app {
        let _ = app.emit(STATUS_EVENT, &state.errors);
    }
}

fn run_window() -> Result<(), String> {
    let instance = message_window::module_instance().map_err(|error| error.to_string())?;
    message_window::register_class::<MediaHotkeyWindow>(instance, CLASS_NAME).map_err(|error| error.to_string())?;
    let window = match message_window::create_message_only_window(instance, CLASS_NAME, "Fly Island Music Shortcuts") {
        Ok(window) => window,
        Err(error) => {
            let _ = message_window::unregister_class(instance, CLASS_NAME);
            return Err(error.to_string());
        }
    };
    state().window = Some(window.0 as isize);
    apply(window);
    message_window::run_message_loop();
    let _ = message_window::destroy_window(window);
    let _ = message_window::unregister_class(instance, CLASS_NAME);
    Ok(())
}

/// Checks every key before registration, including approval keys which are only held while a card shows.
fn register_shortcuts(
    shortcuts: &MediaShortcuts,
    mut register: impl FnMut(i32, u32, u32) -> Result<(), String>,
) -> ([bool; 3], ShortcutErrors) {
    let mut registered = [false; 3];
    let mut errors = ShortcutErrors::new();
    let mut seen = HashSet::new();
    for (index, key) in shortcuts.values().iter().enumerate() {
        if key.trim().is_empty() { continue; }
        let result = match parse_shortcut_binding(key) {
            None => Err("This key combination is invalid or reserved by Windows.".into()),
            Some(binding) => {
                let reserved = ["Ctrl+Alt+Y", "Ctrl+Alt+N", "Ctrl+Alt+T"].iter()
                    .filter_map(|key| parse_shortcut_binding(key))
                    .any(|other| (other.modifiers, other.key_code) == (binding.modifiers, binding.key_code));
                if reserved {
                    Err("This key combination is reserved for Agent approvals.".into())
                } else if !seen.insert((binding.modifiers, binding.key_code)) {
                    Err("Another music shortcut uses this key combination.".into())
                } else {
                    register(FIRST_ID + index as i32, binding.modifiers, binding.key_code)
                }
            }
        };
        match result {
            Ok(()) => registered[index] = true,
            Err(error) => { errors.insert(ACTIONS[index].0.to_string(), error); }
        }
    }
    (registered, errors)
}

fn apply(window: HWND) {
    let mut state = state();
    for (index, registered) in state.registered.iter().enumerate() {
        if *registered { let _ = hotkey::unregister(window, FIRST_ID + index as i32); }
    }
    let (registered, errors) = if state.enabled {
        register_shortcuts(&state.wanted, |id, modifiers, key| {
            hotkey::register(window, id, modifiers, key).map_err(|error| error.to_string())
        })
    } else { ([false; 3], ShortcutErrors::new()) };
    state.registered = registered;
    state.errors = errors;
    publish(&state);
}

fn pressed(id: usize) {
    let Some(index) = id.checked_sub(FIRST_ID as usize).filter(|index| *index < ACTIONS.len()) else { return };
    let target = {
        let state = state();
        if !state.registered[index] { return; }
        state.target.clone()
    };
    // Media COM work uses its existing worker, never the window's message loop or the UI thread.
    tauri::async_runtime::spawn_blocking(move || { let _ = service::run_shortcut(ACTIONS[index].1, target); });
}

struct MediaHotkeyWindow;
impl WindowMessages for MediaHotkeyWindow {
    fn handle(window: HWND, message: u32, wparam: WPARAM, _: LPARAM) -> Option<LRESULT> {
        match message {
            WM_HOTKEY => pressed(wparam.0),
            REFRESH_MESSAGE => apply(window),
            _ => return None,
        }
        Some(LRESULT(0))
    }
}

#[cfg(test)]
mod tests;
