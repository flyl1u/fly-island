use std::{thread, time::Duration};
use tauri::{AppHandle, Manager, WebviewWindow, WebviewWindowBuilder};

pub const WINDOW_LABEL: &str = "settings";

/// Shows a new settings window even if its page never reports in (a load failure),
/// so it cannot stay invisible. Normally the page asks well before this.
const SHOW_FALLBACK_DELAY: Duration = Duration::from_secs(2);

/// The settings window is declared with `create: false` and built on demand,
/// so a closed window does not keep a webview running in the background.
///
/// A new window starts hidden and the page shows it (show_settings_window) after
/// its first paint; shown at once, it sat empty while the webview loaded.
pub fn open(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        let _ = window.unminimize();
        return reveal(&window);
    }

    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == WINDOW_LABEL)
        .ok_or_else(|| "Settings window config was not found.".to_string())?
        .clone();
    let window = WebviewWindowBuilder::from_config(app, &config)
        .map_err(|error| error.to_string())?
        .visible(false)
        .build()
        .map_err(|error| error.to_string())?;

    thread::spawn(move || {
        thread::sleep(SHOW_FALLBACK_DELAY);
        if !window.is_visible().unwrap_or(true) {
            let _ = reveal(&window);
        }
    });
    Ok(())
}

fn reveal(window: &WebviewWindow) -> Result<(), String> {
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

// Async keeps window creation off the IPC thread, which can deadlock on Windows.
#[tauri::command]
pub async fn open_settings_window(app: AppHandle) -> Result<(), String> {
    open(&app)
}

/// Called by the settings page once it has painted, to show its hidden new window.
#[tauri::command]
pub async fn show_settings_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(WINDOW_LABEL)
        .ok_or_else(|| "Settings window was not found.".to_string())?;
    reveal(&window)
}
