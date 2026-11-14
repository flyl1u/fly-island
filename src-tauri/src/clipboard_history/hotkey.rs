//! Global shortcut that opens the clipboard page: parsing and registration.

use std::sync::{Mutex, OnceLock};
use tauri::Emitter;
use windows::Win32::{
    Foundation::HWND,
    UI::{
        Input::KeyboardAndMouse::{MOD_ALT, MOD_CONTROL, MOD_SHIFT, MOD_WIN},
        WindowsAndMessaging::WM_APP,
    },
};

use super::{default_shortcut_binding, service, ShortcutBinding};
use crate::win32;

pub(super) const HOTKEY_EVENT: &str = "clipboard-history-shortcut";

/// Sent after each registration attempt; the payload is the error, or null when the
/// shortcut is registered or turned off.
const HOTKEY_STATUS_EVENT: &str = "clipboard-history-shortcut-status";

pub(super) const HOTKEY_ID: i32 = 0x4643;

pub(super) const HOTKEY_REFRESH_MESSAGE: u32 = WM_APP + 0x51;

pub(super) static CLIPBOARD_HOTKEY_WINDOW: OnceLock<Mutex<Option<isize>>> = OnceLock::new();

static CLIPBOARD_HOTKEY_REGISTERED: OnceLock<Mutex<bool>> = OnceLock::new();

/// Why the last registration failed, kept so a settings page opened later can show it.
static CLIPBOARD_HOTKEY_ERROR: Mutex<Option<String>> = Mutex::new(None);

pub(super) fn hotkey_error() -> Option<String> {
    CLIPBOARD_HOTKEY_ERROR
        .lock()
        .ok()
        .and_then(|error| error.clone())
}

fn report_hotkey_error(error: Option<String>) {
    if let Ok(mut current) = CLIPBOARD_HOTKEY_ERROR.lock() {
        current.clone_from(&error);
    }
    if let Ok(service) = service() {
        let _ = service.app.emit(HOTKEY_STATUS_EVENT, error);
    }
}

pub(super) fn request_hotkey_refresh() {
    let hwnd = CLIPBOARD_HOTKEY_WINDOW
        .get()
        .and_then(|window| window.lock().ok())
        .and_then(|window| *window)
        .map(|window| HWND(window as *mut core::ffi::c_void));

    if let Some(hwnd) = hwnd {
        let _ = win32::message_window::post_message(hwnd, HOTKEY_REFRESH_MESSAGE);
    }
}

pub(super) fn refresh_registered_hotkey(hwnd: HWND) {
    unregister_current_hotkey(hwnd);

    let snapshot = service().ok().and_then(|service| service.snapshot().ok());

    // Turning clipboard history off also frees its shortcut for other apps.
    if snapshot
        .as_ref()
        .is_some_and(|snapshot| !snapshot.settings.enabled || !snapshot.settings.shortcut_enabled)
    {
        report_hotkey_error(None);
        return;
    }

    let Some(binding) = snapshot
        .and_then(|snapshot| parse_shortcut_binding(&snapshot.settings.shortcut))
        .or_else(default_shortcut_binding)
    else {
        return;
    };

    match win32::hotkey::register(hwnd, HOTKEY_ID, binding.modifiers, binding.key_code) {
        Ok(()) => {
            set_hotkey_registered(true);
            report_hotkey_error(None);
        }
        Err(error) => {
            set_hotkey_registered(false);
            report_hotkey_error(Some(format!(
                "快捷键 {} 已被占用或无法注册：{error}",
                binding.label
            )));
        }
    }
}

pub(super) fn unregister_current_hotkey(hwnd: HWND) {
    if hotkey_registered() {
        let _ = win32::hotkey::unregister(hwnd, HOTKEY_ID);
        set_hotkey_registered(false);
    }
}

fn hotkey_registered() -> bool {
    CLIPBOARD_HOTKEY_REGISTERED
        .get_or_init(|| Mutex::new(false))
        .lock()
        .map(|registered| *registered)
        .unwrap_or(false)
}

fn set_hotkey_registered(value: bool) {
    if let Ok(mut registered) = CLIPBOARD_HOTKEY_REGISTERED
        .get_or_init(|| Mutex::new(false))
        .lock()
    {
        *registered = value;
    }
}

pub(crate) fn parse_shortcut_binding(shortcut: &str) -> Option<ShortcutBinding> {
    let mut has_ctrl = false;
    let mut has_alt = false;
    let mut has_shift = false;
    let mut has_win = false;
    let mut key_label: Option<String> = None;
    let mut key_code: Option<u32> = None;

    for part in shortcut
        .split('+')
        .map(|part| part.trim())
        .filter(|part| !part.is_empty())
    {
        let normalized = part.to_ascii_lowercase();

        match normalized.as_str() {
            "ctrl" | "control" => has_ctrl = true,
            "alt" | "option" => has_alt = true,
            "shift" => has_shift = true,
            "win" | "windows" | "meta" | "cmd" | "super" => has_win = true,
            _ => {
                if key_code.is_some() {
                    return None;
                }

                let (label, code) = shortcut_key_code(part)?;
                key_label = Some(label);
                key_code = Some(code);
            }
        }
    }

    if !(has_ctrl || has_alt || has_shift || has_win) {
        return None;
    }

    let mut label_parts = Vec::new();
    let mut modifiers = 0;

    if has_ctrl {
        label_parts.push("Ctrl".to_string());
        modifiers |= MOD_CONTROL.0;
    }

    if has_alt {
        label_parts.push("Alt".to_string());
        modifiers |= MOD_ALT.0;
    }

    if has_shift {
        label_parts.push("Shift".to_string());
        modifiers |= MOD_SHIFT.0;
    }

    if has_win {
        label_parts.push("Win".to_string());
        modifiers |= MOD_WIN.0;
    }

    label_parts.push(key_label?);
    let key_code = key_code?;
    if is_system_shortcut(modifiers, key_code) {
        return None;
    }

    Some(ShortcutBinding {
        label: label_parts.join("+"),
        modifiers,
        key_code,
    })
}

/// Combinations Windows itself uses to switch, close or lock windows. RegisterHotKey
/// accepts some of them (Alt+Tab, Alt+Esc, Ctrl+Esc) and the island would then
/// swallow the system's own action, so they are never registered.
fn is_system_shortcut(modifiers: u32, key_code: u32) -> bool {
    const TAB: u32 = 0x09;
    const ESC: u32 = 0x1B;
    const F4: u32 = 0x73;
    const L: u32 = b'L' as u32;
    const DELETE: u32 = 0x2E;
    let alt = modifiers & MOD_ALT.0 != 0;
    let ctrl = modifiers & MOD_CONTROL.0 != 0;
    let win = modifiers & MOD_WIN.0 != 0;
    match key_code {
        TAB => alt || win,
        ESC => alt || ctrl || win,
        F4 => alt,
        L => win,
        DELETE => ctrl && alt,
        _ => false,
    }
}

fn shortcut_key_code(key: &str) -> Option<(String, u32)> {
    let upper = key.trim().to_ascii_uppercase();

    if upper.len() == 1 {
        let byte = upper.as_bytes()[0];

        if byte.is_ascii_alphanumeric() {
            return Some((upper, byte as u32));
        }
    }

    if let Some(number) = upper
        .strip_prefix('F')
        .and_then(|value| value.parse::<u32>().ok())
    {
        if (1..=24).contains(&number) {
            return Some((format!("F{number}"), 0x70 + number - 1));
        }
    }

    match upper.as_str() {
        "ESC" | "ESCAPE" => Some(("Esc".to_string(), 0x1B)),
        "TAB" => Some(("Tab".to_string(), 0x09)),
        "ENTER" | "RETURN" => Some(("Enter".to_string(), 0x0D)),
        "SPACE" => Some(("Space".to_string(), 0x20)),
        "BACKSPACE" => Some(("Backspace".to_string(), 0x08)),
        "DELETE" | "DEL" => Some(("Delete".to_string(), 0x2E)),
        "INSERT" | "INS" => Some(("Insert".to_string(), 0x2D)),
        "HOME" => Some(("Home".to_string(), 0x24)),
        "END" => Some(("End".to_string(), 0x23)),
        "PAGEUP" | "PAGE UP" => Some(("PageUp".to_string(), 0x21)),
        "PAGEDOWN" | "PAGE DOWN" => Some(("PageDown".to_string(), 0x22)),
        "ARROWUP" | "UP" => Some(("Up".to_string(), 0x26)),
        "ARROWDOWN" | "DOWN" => Some(("Down".to_string(), 0x28)),
        "ARROWLEFT" | "LEFT" => Some(("Left".to_string(), 0x25)),
        "ARROWRIGHT" | "RIGHT" => Some(("Right".to_string(), 0x27)),
        // Punctuation as the settings recorder names it (the US layout, unshifted);
        // the codes are the VK_OEM_* keys in the same physical places.
        ";" => Some((upper, 0xBA)),
        "=" => Some((upper, 0xBB)),
        "," => Some((upper, 0xBC)),
        "-" => Some((upper, 0xBD)),
        "." => Some((upper, 0xBE)),
        "/" => Some((upper, 0xBF)),
        "`" => Some((upper, 0xC0)),
        "[" => Some((upper, 0xDB)),
        "\\" => Some((upper, 0xDC)),
        "]" => Some((upper, 0xDD)),
        "'" => Some((upper, 0xDE)),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::super::{ClipboardHistorySettings, DEFAULT_SHORTCUT};
    use super::*;

    #[test]
    fn space_shortcuts_parse_but_a_bare_space_key_does_not() {
        let binding = parse_shortcut_binding("Ctrl+Space").expect("Ctrl+Space is valid");
        assert_eq!(binding.label, "Ctrl+Space");
        assert_eq!(binding.key_code, 0x20);
        // What the settings recorder produced before the space key fix.
        assert!(parse_shortcut_binding("Ctrl+ ").is_none());
    }

    #[test]
    fn punctuation_keys_from_the_recorder_register() {
        for (shortcut, code) in [("Ctrl+Shift+/", 0xBF), ("Alt+;", 0xBA), ("Ctrl+Alt+\\", 0xDC), ("Ctrl+-", 0xBD)] {
            let binding = parse_shortcut_binding(shortcut).expect("punctuation is valid");
            assert_eq!(binding.label, shortcut);
            assert_eq!(binding.key_code, code);
        }
        // Shifted symbols are what the recorder produced before it read the physical key.
        assert!(parse_shortcut_binding("Ctrl+Shift+!").is_none());
    }

    #[test]
    fn system_switching_shortcuts_are_never_registered() {
        for shortcut in ["Alt+Tab", "Alt+Shift+Tab", "Win+Tab", "Alt+Esc", "Ctrl+Esc", "Ctrl+Shift+Esc", "Alt+F4", "Win+L", "Ctrl+Alt+Delete"] {
            assert!(parse_shortcut_binding(shortcut).is_none(), "{shortcut} belongs to Windows");
        }
        for shortcut in ["Ctrl+Tab", "Ctrl+Shift+Tab", "Alt+F5", "Ctrl+L", "Alt+L"] {
            assert!(parse_shortcut_binding(shortcut).is_some(), "{shortcut} is an ordinary shortcut");
        }
    }

    #[test]
    fn the_default_shortcut_parses_to_its_own_label() {
        let binding = default_shortcut_binding().expect("the default shortcut is valid");
        assert_eq!(binding.label, DEFAULT_SHORTCUT);
    }

    #[test]
    fn saved_settings_on_the_old_default_move_to_the_new_one() {
        let saved = |shortcut: &str| ClipboardHistorySettings {
            shortcut: shortcut.to_string(),
            ..ClipboardHistorySettings::default()
        };
        assert_eq!(saved("Ctrl+X").normalized().shortcut, DEFAULT_SHORTCUT);
        assert_eq!(saved("ctrl + x").normalized().shortcut, DEFAULT_SHORTCUT);
        assert_eq!(saved("Ctrl+Alt+V").normalized().shortcut, "Ctrl+Alt+V");
    }
}
