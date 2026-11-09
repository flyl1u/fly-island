//! Liquid glass: the native window stays clear and the material is drawn in CSS.

use std::sync::OnceLock;
use tauri::WebviewWindow;

use super::state::IslandWindowState;
use crate::win32;

pub(super) static NATIVE_GLASS_INITIALIZED: OnceLock<()> = OnceLock::new();

pub(super) fn parse_hex_color(value: &str) -> Option<(u8, u8, u8)> {
    let hex = value.strip_prefix('#')?;
    if hex.len() != 6 || !hex.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }

    Some((
        u8::from_str_radix(&hex[0..2], 16).ok()?,
        u8::from_str_radix(&hex[2..4], 16).ok()?,
        u8::from_str_radix(&hex[4..6], 16).ok()?,
    ))
}

pub(super) fn clear_window_glass_region(window: &WebviewWindow) -> Result<(), String> {
    let hwnd = window.hwnd().map_err(|error| error.to_string())?;
    if !win32::window::clear_window_region(hwnd) {
        return Err("Failed to clear the liquid glass window region.".to_string());
    }
    Ok(())
}

pub(super) fn apply_glass_material(
    window: &WebviewWindow,
    state: IslandWindowState,
) -> Result<String, String> {
    // The main window is a fixed, transparent stage (820x460), while the island
    // itself is much smaller. Windows 11's DWM Acrylic backdrop is applied to
    // the whole HWND and cannot be reliably clipped by SetWindowRgn, leaving a
    // large blurred rectangle around the island. Keep the native state clear
    // and render the glass effect on the island element with CSS instead.
    // CSS owns the material for the lifetime of the main window. Reapplying
    // these native resets on every toggle needlessly invalidates its surface.
    if NATIVE_GLASS_INITIALIZED.get().is_none() {
        let _ = window_vibrancy::clear_acrylic(window);
        clear_window_glass_region(window)?;
        let _ = NATIVE_GLASS_INITIALIZED.set(());
    }

    if state.glass_enabled {
        Ok("css-fallback".to_string())
    } else {
        Ok("disabled".to_string())
    }
}
