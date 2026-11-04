//! System tray icon and menu.

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App,
};

use crate::{island, settings_window};

pub(crate) fn build_tray(app: &App) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "Show Island", true, None::<&str>)?;
    let hide_item = MenuItem::with_id(app, "hide", "Hide Island", true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &hide_item, &settings_item, &quit_item])?;

    let mut tray = TrayIconBuilder::new()
        .tooltip("fly-island")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                let _ = island::show_island(app);
            }
            "hide" => island::hide_island(app),
            "settings" => {
                if let Err(error) = settings_window::open(app) {
                    eprintln!("failed to open settings window: {error}");
                }
            }
            "quit" => {
                settings_window::remember_bounds(app);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = island::show_island(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }

    tray.build(app)?;
    Ok(())
}
