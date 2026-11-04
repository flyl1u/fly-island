mod bounds;

use std::{thread, time::Duration};
use tauri::{AppHandle, Manager, WebviewWindow, WebviewWindowBuilder, WindowEvent};

pub const WINDOW_LABEL: &str = "settings";

/// Shows a new settings window even if its page never reports in (a load failure),
/// so it cannot stay invisible. Normally the page asks well before this.
const SHOW_FALLBACK_DELAY: Duration = Duration::from_secs(2);

/// Room left above and below a new window, so its frame stays clear of the taskbar.
const SCREEN_MARGIN: f64 = 48.0;

/// The settings window is declared with `create: false` and built on demand,
/// so a closed window does not keep a webview running in the background.
///
/// A new window starts hidden and the page shows it (show_settings_window) after
/// its first paint; shown at once, it sat empty while the webview loaded. It opens at
/// the size and place it had when last closed (see `bounds`).
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
    let mut config = config;
    let saved = bounds::load(app);
    if let Some(saved) = saved {
        config.width = saved.width.max(config.min_width.unwrap_or(0.0));
        config.height = saved.height;
    }
    if let Ok(Some(monitor)) = app.primary_monitor() {
        let usable = f64::from(monitor.work_area().size.height) / monitor.scale_factor();
        config.height = fit_height(config.height, config.min_height, usable);
    }
    let window = WebviewWindowBuilder::from_config(app, &config)
        .map_err(|error| error.to_string())?
        .visible(false)
        .build()
        .map_err(|error| error.to_string())?;
    if let Some(saved) = saved {
        bounds::restore_position(app, &window, saved);
    }
    let closing = window.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::CloseRequested { .. }) {
            bounds::save(&closing);
        }
    });

    thread::spawn(move || {
        thread::sleep(SHOW_FALLBACK_DELAY);
        if !window.is_visible().unwrap_or(true) {
            let _ = reveal(&window);
        }
    });
    Ok(())
}

/// The configured height, shortened to fit a small or highly scaled screen,
/// but never below the window's minimum height.
fn fit_height(wanted: f64, min_height: Option<f64>, usable: f64) -> f64 {
    let fitted = wanted.min(usable - SCREEN_MARGIN * 2.0);
    fitted.max(min_height.unwrap_or(0.0))
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

#[cfg(test)]
mod tests {
    use super::bounds::title_bar_on_screen;
    use super::fit_height;

    #[test]
    fn a_saved_place_on_a_screen_is_reused() {
        let screens = [(0, 0, 1920, 1040), (1920, 0, 2560, 1400)];
        assert!(title_bar_on_screen(100, 80, &screens));
        assert!(title_bar_on_screen(2400, 200, &screens));
    }

    #[test]
    fn a_saved_place_off_every_screen_is_dropped() {
        let screens = [(0, 0, 1920, 1040)];
        assert!(!title_bar_on_screen(2400, 200, &screens));
        assert!(!title_bar_on_screen(1850, 200, &screens));
        assert!(!title_bar_on_screen(100, 1030, &screens));
        assert!(!title_bar_on_screen(-32000, -32000, &screens));
    }

    #[test]
    fn keeps_the_configured_height_on_a_tall_screen() {
        assert_eq!(fit_height(820.0, Some(420.0), 1400.0), 820.0);
    }

    #[test]
    fn shortens_to_the_usable_screen_height() {
        assert_eq!(fit_height(820.0, Some(420.0), 680.0), 584.0);
    }

    #[test]
    fn never_goes_below_the_minimum_height() {
        assert_eq!(fit_height(820.0, Some(420.0), 400.0), 420.0);
    }
}
