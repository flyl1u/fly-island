//! The clipboard's on-demand window. Creation stays off the Windows IPC thread.
mod bounds;

use crate::settings_window::sizing::{self, Size};
use std::{thread, time::Duration};
use tauri::{
    AppHandle, Manager, Monitor, PhysicalPosition, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

pub(crate) const WINDOW_LABEL: &str = "clipboard";
const SHOW_FALLBACK_DELAY: Duration = Duration::from_secs(2);

pub(crate) fn open(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        let _ = window.unminimize();
        return reveal(&window);
    }
    let mut config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == WINDOW_LABEL)
        .ok_or_else(|| "Clipboard window config was not found.".to_string())?
        .clone();
    let saved = bounds::load(app);
    let monitors = app.available_monitors().unwrap_or_default();
    let saved_screen = saved.and_then(|place| bounds::screen_of(place, &monitors));
    let screen = saved_screen.cloned().or_else(|| island_screen(app));
    let wanted = saved.map_or(
        Size {
            width: config.width,
            height: config.height,
        },
        |saved| Size {
            width: saved.width,
            height: saved.height,
        },
    );
    let min = Size {
        width: config.min_width.unwrap_or(360.0),
        height: config.min_height.unwrap_or(420.0),
    };
    let size = screen.as_ref().map_or(wanted, |screen| {
        let area = screen.work_area().size;
        sizing::fit(
            wanted,
            min,
            Size {
                width: f64::from(area.width) / screen.scale_factor(),
                height: f64::from(area.height) / screen.scale_factor(),
            },
        )
    });
    config.width = size.width.max(min.width);
    config.height = size.height.max(min.height);
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
            let area = screen.work_area();
            let scale = screen.scale_factor();
            let x = area.position.x
                + ((f64::from(area.size.width) - config.width * scale) / 2.0).max(0.0) as i32;
            let y = area.position.y
                + ((f64::from(area.size.height) - config.height * scale) / 2.0).max(0.0) as i32;
            let _ = window.set_position(PhysicalPosition::new(x, y));
        }
        _ => {}
    }
    let closing = window.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::CloseRequested { .. }) {
            bounds::save(&closing);
            // Tearing down the webview takes a moment; hide first so closing feels instant.
            let _ = closing.hide();
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

fn island_screen(app: &AppHandle) -> Option<Monitor> {
    app.get_webview_window(crate::island::WINDOW_LABEL)
        .and_then(|window| window.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())
}

fn reveal(window: &WebviewWindow) -> Result<(), String> {
    window.show().map_err(|error| error.to_string())?;
    crate::system::window_focus::focus_window(window)
}

pub(crate) fn remember_bounds(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        bounds::save(&window);
    }
}

#[tauri::command]
pub async fn open_clipboard_window(app: AppHandle) -> Result<(), String> {
    open(&app)
}

#[tauri::command]
pub async fn show_clipboard_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(WINDOW_LABEL)
        .ok_or_else(|| "Clipboard window was not found.".to_string())?;
    reveal(&window)
}

#[tauri::command]
pub async fn close_clipboard_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        bounds::save(&window);
        window.close().map_err(|error| error.to_string())?;
    }
    Ok(())
}

macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::clipboard_window::open_clipboard_window,
            crate::clipboard_window::show_clipboard_window,
            crate::clipboard_window::close_clipboard_window,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;

#[cfg(test)]
mod tests {
    use super::bounds::title_bar_on_screen;

    #[test]
    fn saved_titlebar_must_remain_accessible() {
        let screens = [(0, 0, 1920, 1040), (-1920, 0, 1920, 1040)];
        assert!(title_bar_on_screen(100, 80, &screens));
        assert!(title_bar_on_screen(-1500, 80, &screens));
        assert!(!title_bar_on_screen(2400, 200, &screens));
        assert!(!title_bar_on_screen(1850, 200, &screens));
        assert!(!title_bar_on_screen(100, 1030, &screens));
    }
}
