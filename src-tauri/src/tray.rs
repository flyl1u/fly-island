//! System tray icon and menu. One item shows or hides the island, named for what
//! it will do: the visibility is checked whenever the cursor reaches the tray
//! icon, before the menu opens.

use std::sync::{Mutex, PoisonError};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Manager, Wry,
};

use crate::{island, settings_window};

/// The show / hide item's text for a visible or hidden island.
fn toggle_label(island_visible: bool) -> &'static str {
    if island_visible {
        "Hide Island"
    } else {
        "Show Island"
    }
}

struct TrayMenu {
    toggle: MenuItem<Wry>,
    /// The visibility the toggle text was last set for.
    shown: Mutex<bool>,
}

fn island_visible(app: &AppHandle) -> bool {
    island::main_window(app)
        .and_then(|window| window.is_visible().map_err(|error| error.to_string()))
        .unwrap_or(true)
}

/// Names the toggle item for the island's visibility now.
fn refresh(app: &AppHandle) {
    let Some(menu) = app.try_state::<TrayMenu>() else { return };
    let visible = island_visible(app);
    let mut shown = menu.shown.lock().unwrap_or_else(PoisonError::into_inner);
    if *shown == visible {
        return;
    }
    let _ = menu.toggle.set_text(toggle_label(visible));
    *shown = visible;
}

pub(crate) fn build_tray(app: &App) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", toggle_label(true), true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle, &settings, &quit])?;
    app.manage(TrayMenu { toggle, shown: Mutex::new(true) });

    let mut tray = TrayIconBuilder::new()
        .tooltip("fly-island")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle" => {
                if island_visible(app) {
                    island::hide_island(app);
                } else {
                    let _ = island::show_island(app);
                }
                refresh(app);
            }
            "settings" => {
                if let Err(error) = settings_window::request(app) {
                    eprintln!("failed to open settings: {error}");
                }
            }
            "quit" => {
                settings_window::remember_bounds(app);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            // The cursor reaching the icon comes before any click, so the menu opens with the
            // right show / hide text even when the island was hidden some other way.
            TrayIconEvent::Enter { .. } | TrayIconEvent::Move { .. } => refresh(tray.app_handle()),
            TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } => {
                let _ = island::show_island(tray.app_handle());
                refresh(tray.app_handle());
            }
            _ => {}
        });

    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }

    tray.build(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::toggle_label;

    #[test]
    fn the_toggle_names_what_it_will_do() {
        assert_eq!(toggle_label(true), "Hide Island");
        assert_eq!(toggle_label(false), "Show Island");
    }
}
