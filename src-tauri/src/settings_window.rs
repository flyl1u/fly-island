use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewWindowBuilder};

pub(crate) const WINDOW_LABEL: &str = "settings";
static OPEN_WINDOW: Mutex<()> = Mutex::new(());

fn open(app: &AppHandle) -> Result<(), String> {
    // Opening from the header and tray at once must still create one window.
    let _guard = OPEN_WINDOW
        .lock()
        .map_err(|_| "Settings window state is unavailable.".to_string())?;
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        window.unminimize().map_err(|error| error.to_string())?;
        window.show().map_err(|error| error.to_string())?;
        return window.set_focus().map_err(|error| error.to_string());
    }

    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == WINDOW_LABEL)
        .ok_or_else(|| "Settings window config was not found.".to_string())?;
    let window = WebviewWindowBuilder::from_config(app, config)
        .map_err(|error| error.to_string())?
        .build()
        .map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

// Building a WebView2 window from the menu/IPC thread can deadlock on Windows.
#[tauri::command]
pub async fn open_settings_window(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || open(&app))
        .await
        .map_err(|error| format!("Settings window task failed: {error}"))?
}

pub(crate) fn open_from_tray(app: &AppHandle) {
    if let Err(error) = request_settings(app) {
        eprintln!("failed to open settings: {error}");
    }
}

fn request_settings(app: &AppHandle) -> Result<(), String> {
    crate::island::show_island(app)?;
    app.emit_to("main", "settings-open-requested", ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn dock_settings_window(app: AppHandle) -> Result<(), String> {
    request_settings(&app)?;
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        window.close().map_err(|error| error.to_string())?;
    }
    Ok(())
}
