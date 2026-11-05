mod bounds;
mod sizing;

use sizing::Size;
use std::{thread, time::Duration};
use tauri::{
    AppHandle, Manager, Monitor, PhysicalPosition, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

pub const WINDOW_LABEL: &str = "settings";

/// Shows a new settings window even if its page never reports in (a load failure),
/// so it cannot stay invisible. Normally the page asks well before this.
const SHOW_FALLBACK_DELAY: Duration = Duration::from_secs(2);

/// The settings window is declared with `create: false` and built on demand,
/// so a closed window does not keep a webview running in the background.
///
/// A new window starts hidden and the page shows it (show_settings_window) after
/// its first paint; shown at once, it sat empty while the webview loaded. It always
/// opens at the configured size, shrunk to fit a small screen, at the place it had
/// when last closed (see `bounds`); a first window is centered on the island's screen.
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
    let min = Size {
        width: config.min_width.unwrap_or(0.0),
        height: config.min_height.unwrap_or(0.0),
    };
    let monitors = app.available_monitors().unwrap_or_default();
    let saved = bounds::load(app);
    let saved_screen = saved.and_then(|saved| bounds::screen_of(saved, &monitors));
    let screen = saved_screen.cloned().or_else(|| island_screen(app));
    let screen_size = screen.as_ref().map(logical_work_area);

    let wanted = Size {
        width: config.width,
        height: config.height,
    };
    let size = match screen_size {
        Some(screen_size) => sizing::fit(wanted, min, screen_size),
        None => Size {
            width: wanted.width.max(min.width),
            height: wanted.height.max(min.height),
        },
    };
    config.width = size.width;
    config.height = size.height;

    let window = WebviewWindowBuilder::from_config(app, &config)
        .map_err(|error| error.to_string())?
        .visible(false)
        .build()
        .map_err(|error| error.to_string())?;
    match (saved, saved_screen, screen.as_ref()) {
        (Some(saved), Some(_), _) => {
            let _ = window.set_position(PhysicalPosition::new(saved.x, saved.y));
        }
        (_, _, Some(screen)) => {
            let _ = window.set_position(centered(screen, size));
        }
        _ => {}
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

/// The screen the island is on, so settings open where the user is looking;
/// the primary screen when the island has none.
fn island_screen(app: &AppHandle) -> Option<Monitor> {
    app.get_webview_window(crate::island::WINDOW_LABEL)
        .and_then(|island| island.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())
}

fn logical_work_area(monitor: &Monitor) -> Size {
    let area = monitor.work_area().size;
    Size {
        width: f64::from(area.width) / monitor.scale_factor(),
        height: f64::from(area.height) / monitor.scale_factor(),
    }
}

/// Where a window of this logical size sits centered in the screen's work area.
fn centered(monitor: &Monitor, size: Size) -> PhysicalPosition<i32> {
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let offset = |available: u32, length: f64| {
        ((f64::from(available) - length * scale) / 2.0).max(0.0) as i32
    };
    PhysicalPosition::new(
        area.position.x + offset(area.size.width, size.width),
        area.position.y + offset(area.size.height, size.height),
    )
}

/// Saves the open settings window's size and place before the app quits, which
/// closes it without a close request.
pub fn remember_bounds(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        bounds::save(&window);
    }
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
}
