//! Global shortcuts from running plugins' `contributes.commands[].keybinding`.
//! A hidden window of its own registers them; a press goes to the island
//! window as `plugin-keybinding`, which checks the command's `when` clause
//! (src/features/plugins/when.ts) and runs it. Combinations that cannot be
//! registered (another app or the island already uses them) are listed per
//! plugin for its settings card.

use serde_json::json;
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
    thread,
    time::Duration,
};
use tauri::Emitter;
use windows::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, WPARAM},
    UI::WindowsAndMessaging::{WM_APP, WM_HOTKEY},
};

use super::{host, lock};
use crate::{
    clipboard_history::parse_shortcut_binding,
    island,
    win32::{
        self,
        message_window::{self, WindowMessages},
    },
};

/// Mirrored by `PLUGIN_KEYBINDING_EVENT` in src/features/plugins/api.ts.
const KEYBINDING_EVENT: &str = "plugin-keybinding";
const REFRESH_MESSAGE: u32 = WM_APP + 0x61;
const FIRST_HOTKEY_ID: i32 = 0x5100;
/// The island's own shortcuts register while the app starts; plugins wait so
/// they cannot take those first.
const STARTUP_DELAY: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, PartialEq, Eq)]
struct Binding {
    plugin_id: String,
    command: String,
    when: Option<String>,
    label: String,
    modifiers: u32,
    key_code: u32,
}

#[derive(Default)]
struct State {
    /// The hidden window, once its thread has started.
    window: Option<isize>,
    wanted: Vec<Binding>,
    /// Registered as FIRST_HOTKEY_ID + index.
    registered: Vec<Binding>,
    /// Shortcut labels per plugin id that could not be registered.
    conflicts: HashMap<String, Vec<String>>,
}

fn state() -> &'static Mutex<State> {
    static STATE: OnceLock<Mutex<State>> = OnceLock::new();
    STATE.get_or_init(Mutex::default)
}

/// Shortcuts of `plugin_id` that another app or plugin already uses.
pub(super) fn conflicts(plugin_id: &str) -> Vec<String> {
    lock(state()).conflicts.get(plugin_id).cloned().unwrap_or_default()
}

/// Starts the shortcut window's thread.
pub(super) fn start() {
    let _ = thread::Builder::new().name("plugin-hotkeys".into()).spawn(|| {
        thread::sleep(STARTUP_DELAY);
        const CLASS_NAME: &str = "FocuSDPluginHotkeys";
        let Ok(instance) = message_window::module_instance() else { return };
        if message_window::register_class::<PluginHotkeyWindow>(instance, CLASS_NAME).is_err() {
            return;
        }
        let Ok(window) = message_window::create_message_only_window(instance, CLASS_NAME, "FocuSD Plugin Hotkeys") else {
            return;
        };
        lock(state()).window = Some(window.0 as isize);
        apply(window);
        message_window::run_message_loop();
    });
}

/// Registers the shortcuts of the plugins running now, replacing the old ones.
pub(super) fn refresh() {
    let Ok(host) = host() else { return };
    let running: Vec<String> = lock(&host.supervisors).keys().cloned().collect();
    let wanted: Vec<Binding> = lock(&host.installed)
        .iter()
        .filter(|plugin| running.contains(&plugin.folder))
        .filter_map(|plugin| plugin.manifest.as_ref().ok())
        .flat_map(|manifest| {
            manifest.contributes.commands.iter().filter_map(|command| {
                let binding = parse_shortcut_binding(command.keybinding()?)?;
                Some(Binding {
                    plugin_id: manifest.id.clone(),
                    command: command.id().to_string(),
                    when: command.when().map(str::to_string),
                    label: binding.label,
                    modifiers: binding.modifiers,
                    key_code: binding.key_code,
                })
            })
        })
        .collect();
    let window = {
        let mut state = lock(state());
        if state.wanted == wanted {
            return;
        }
        state.wanted = wanted;
        state.window
    };
    // Before the window exists, its thread registers `wanted` when it starts.
    if let Some(window) = window {
        let _ = message_window::post_message(HWND(window as *mut _), REFRESH_MESSAGE);
    }
}

/// Runs on the window's thread, which owns the registrations.
fn apply(window: HWND) {
    let mut state = lock(state());
    for index in 0..state.registered.len() {
        let _ = win32::hotkey::unregister(window, FIRST_HOTKEY_ID + index as i32);
    }
    state.registered.clear();
    state.conflicts.clear();
    for binding in state.wanted.clone() {
        let id = FIRST_HOTKEY_ID + state.registered.len() as i32;
        if win32::hotkey::register(window, id, binding.modifiers, binding.key_code).is_ok() {
            state.registered.push(binding);
        } else {
            state.conflicts.entry(binding.plugin_id).or_default().push(binding.label);
        }
    }
}

fn pressed(id: usize) {
    let Some(binding) = id
        .checked_sub(FIRST_HOTKEY_ID as usize)
        .and_then(|index| lock(state()).registered.get(index).cloned())
    else {
        return;
    };
    let Ok(host) = host() else { return };
    let payload = json!({ "pluginId": binding.plugin_id, "command": binding.command, "when": binding.when });
    let _ = host.app.emit_to(island::WINDOW_LABEL, KEYBINDING_EVENT, payload);
}

struct PluginHotkeyWindow;

impl WindowMessages for PluginHotkeyWindow {
    fn handle(window: HWND, message: u32, wparam: WPARAM, _: LPARAM) -> Option<LRESULT> {
        match message {
            WM_HOTKEY => pressed(wparam.0),
            REFRESH_MESSAGE => apply(window),
            _ => return None,
        }
        Some(LRESULT(0))
    }
}
