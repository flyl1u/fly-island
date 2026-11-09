//! Shortcuts for the island's agent permission card (roadmap B6 2.5). They are system-wide, so
//! they are registered only while a card is showing and released as soon as it goes; the rest of
//! the time the keys belong to other apps. A press goes to the island as `agent-approval-hotkey`
//! with the card action, which the card handles like a click.

use serde::Deserialize;
use serde_json::json;
use std::{
    sync::{Mutex, MutexGuard, OnceLock, PoisonError},
    thread,
};
use tauri::{AppHandle, Emitter};
use windows::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, WPARAM},
    UI::WindowsAndMessaging::{WM_APP, WM_HOTKEY},
};

use crate::{
    clipboard_history::parse_shortcut_binding,
    island,
    win32::{
        self,
        message_window::{self, WindowMessages},
    },
};

/// Mirrored by `APPROVAL_HOTKEY_EVENT` in src/features/agent-status/approvals/api.ts.
const HOTKEY_EVENT: &str = "agent-approval-hotkey";
const REFRESH_MESSAGE: u32 = WM_APP + 0x63;
const FIRST_HOTKEY_ID: i32 = 0x5300;
const CLASS_NAME: &str = "FocuSDAgentApprovalHotkeys";

/// One card action and the shortcut that answers it, e.g. `allow` / `Ctrl+Alt+Y`.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct ApprovalHotkey {
    action: String,
    shortcut: String,
}

#[derive(Default)]
struct State {
    app: Option<AppHandle>,
    /// The hidden window, once its thread has started.
    window: Option<isize>,
    started: bool,
    wanted: Vec<ApprovalHotkey>,
    /// The action of each registered hotkey, as FIRST_HOTKEY_ID + index.
    registered: Vec<String>,
}

fn state() -> MutexGuard<'static, State> {
    static STATE: OnceLock<Mutex<State>> = OnceLock::new();
    STATE.get_or_init(Mutex::default).lock().unwrap_or_else(PoisonError::into_inner)
}

/// Registers `hotkeys` while the card shows; an empty list releases them all. Shortcuts another
/// app already holds are skipped, and the card's buttons still work.
#[tauri::command]
pub fn set_agent_approval_hotkeys(app: AppHandle, hotkeys: Vec<ApprovalHotkey>) {
    let (window, start) = {
        let mut state = state();
        if state.wanted == hotkeys {
            return;
        }
        state.wanted = hotkeys;
        state.app.get_or_insert(app);
        let start = !state.started && !state.wanted.is_empty();
        state.started |= start;
        (state.window, start)
    };
    if start {
        let _ = thread::Builder::new().name("agent-approval-hotkeys".into()).spawn(run_window);
    } else if let Some(window) = window {
        let _ = message_window::post_message(HWND(window as *mut _), REFRESH_MESSAGE);
    }
}

/// The hidden window's thread, which owns the registrations; it registers what is wanted when it starts.
fn run_window() {
    let Ok(instance) = message_window::module_instance() else { return };
    if message_window::register_class::<ApprovalHotkeyWindow>(instance, CLASS_NAME).is_err() {
        return;
    }
    let Ok(window) = message_window::create_message_only_window(instance, CLASS_NAME, "FocuSD Agent Approval Hotkeys") else {
        return;
    };
    state().window = Some(window.0 as isize);
    apply(window);
    message_window::run_message_loop();
}

fn apply(window: HWND) {
    let mut state = state();
    for index in 0..state.registered.len() {
        let _ = win32::hotkey::unregister(window, FIRST_HOTKEY_ID + index as i32);
    }
    state.registered.clear();
    for hotkey in state.wanted.clone() {
        let Some(binding) = parse_shortcut_binding(&hotkey.shortcut) else { continue };
        let id = FIRST_HOTKEY_ID + state.registered.len() as i32;
        if win32::hotkey::register(window, id, binding.modifiers, binding.key_code).is_ok() {
            state.registered.push(hotkey.action);
        }
    }
}

fn pressed(id: usize) {
    let state = state();
    let Some(action) = id.checked_sub(FIRST_HOTKEY_ID as usize).and_then(|index| state.registered.get(index)) else {
        return;
    };
    if let Some(app) = &state.app {
        let _ = app.emit_to(island::WINDOW_LABEL, HOTKEY_EVENT, json!({ "action": action }));
    }
}

struct ApprovalHotkeyWindow;

impl WindowMessages for ApprovalHotkeyWindow {
    fn handle(window: HWND, message: u32, wparam: WPARAM, _: LPARAM) -> Option<LRESULT> {
        match message {
            WM_HOTKEY => pressed(wparam.0),
            REFRESH_MESSAGE => apply(window),
            _ => return None,
        }
        Some(LRESULT(0))
    }
}
