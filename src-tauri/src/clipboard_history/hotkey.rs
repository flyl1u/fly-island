//! Global shortcut that opens the clipboard page: parsing and registration.

use std::sync::{Mutex, OnceLock};
use windows::Win32::{
    Foundation::HWND,
    UI::{
        Input::KeyboardAndMouse::{MOD_ALT, MOD_CONTROL, MOD_SHIFT, MOD_WIN},
        WindowsAndMessaging::WM_APP,
    },
};

use super::*;
use crate::win32;

pub(super) const HOTKEY_EVENT: &str = "clipboard-history-shortcut";

pub(super) const HOTKEY_ID: i32 = 0x4643;

pub(super) const HOTKEY_REFRESH_MESSAGE: u32 = WM_APP + 0x51;

pub(super) static CLIPBOARD_HOTKEY_WINDOW: OnceLock<Mutex<Option<isize>>> = OnceLock::new();

pub(super) static CLIPBOARD_HOTKEY_REGISTERED: OnceLock<Mutex<bool>> = OnceLock::new();

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
        return;
    }

    let Some(binding) = snapshot
        .and_then(|snapshot| parse_shortcut_binding(&snapshot.settings.shortcut))
        .or_else(default_shortcut_binding)
    else {
        return;
    };

    match win32::hotkey::register(hwnd, HOTKEY_ID, binding.modifiers, binding.key_code) {
        Ok(()) => set_hotkey_registered(true),
        Err(error) => {
            set_hotkey_registered(false);
            eprintln!(
                "failed to register clipboard history shortcut {}: {error}",
                binding.label
            );
        }
    }
}

pub(super) fn unregister_current_hotkey(hwnd: HWND) {
    if hotkey_registered() {
        let _ = win32::hotkey::unregister(hwnd, HOTKEY_ID);
        set_hotkey_registered(false);
    }
}

pub(super) fn hotkey_registered() -> bool {
    CLIPBOARD_HOTKEY_REGISTERED
        .get_or_init(|| Mutex::new(false))
        .lock()
        .map(|registered| *registered)
        .unwrap_or(false)
}

pub(super) fn set_hotkey_registered(value: bool) {
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

    Some(ShortcutBinding {
        label: label_parts.join("+"),
        modifiers,
        key_code: key_code?,
    })
}

pub(super) fn shortcut_key_code(key: &str) -> Option<(String, u32)> {
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
        _ => None,
    }
}

#[cfg(test)]
mod tests {
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
    fn the_default_shortcut_parses_to_its_own_label() {
        let binding = default_shortcut_binding().expect("the default shortcut is valid");
        assert_eq!(binding.label, DEFAULT_SHORTCUT);
    }
}
