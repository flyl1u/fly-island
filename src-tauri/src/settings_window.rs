use std::sync::Mutex;
use tauri::{AppHandle, Manager, WebviewWindowBuilder};

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
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = open_settings_window(app).await {
            eprintln!("failed to open settings window: {error}");
        }
    });
}
