//! System tray icon and menu. The menu follows the island's language, which the
//! island window reports with `set_tray_language` (Chinese until it does, the
//! interface's own fallback), and has one item that shows or hides the island,
//! named for what it will do: the visibility is checked whenever the cursor
//! reaches the tray icon, before the menu opens.

use std::sync::{Mutex, PoisonError};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Manager, Wry,
};

use crate::{island, settings_window};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum TrayLanguage {
    Chinese,
    English,
}

impl TrayLanguage {
    /// The island's locale code ("zh-CN", "en"); anything else is Chinese, as in the interface.
    pub(crate) fn from_locale(locale: &str) -> Self {
        if locale.to_ascii_lowercase().starts_with("en") {
            Self::English
        } else {
            Self::Chinese
        }
    }
}

/// The menu's texts: the show / hide item for a visible or hidden island, Settings and Quit.
pub(crate) fn labels(language: TrayLanguage, island_visible: bool) -> [&'static str; 3] {
    match (language, island_visible) {
        (TrayLanguage::Chinese, true) => ["隐藏岛屿", "设置", "退出"],
        (TrayLanguage::Chinese, false) => ["显示岛屿", "设置", "退出"],
        (TrayLanguage::English, true) => ["Hide Island", "Settings", "Quit"],
        (TrayLanguage::English, false) => ["Show Island", "Settings", "Quit"],
    }
}

struct TrayMenu {
    toggle: MenuItem<Wry>,
    settings: MenuItem<Wry>,
    quit: MenuItem<Wry>,
    /// The language and visibility the texts were last set for.
    shown: Mutex<(TrayLanguage, bool)>,
}

fn island_visible(app: &AppHandle) -> bool {
    island::main_window(app)
        .and_then(|window| window.is_visible().map_err(|error| error.to_string()))
        .unwrap_or(true)
}

/// Sets the menu's texts for `language` (None: keep the current one) and the island's visibility now.
fn refresh(app: &AppHandle, language: Option<TrayLanguage>) {
    let Some(menu) = app.try_state::<TrayMenu>() else { return };
    let visible = island_visible(app);
    let mut shown = menu.shown.lock().unwrap_or_else(PoisonError::into_inner);
    let next = (language.unwrap_or(shown.0), visible);
    if *shown == next {
        return;
    }
    let [toggle, settings, quit] = labels(next.0, next.1);
    let _ = menu.toggle.set_text(toggle);
    let _ = menu.settings.set_text(settings);
    let _ = menu.quit.set_text(quit);
    *shown = next;
}

/// The island's interface language changed (or the island started); the tray menu follows it.
#[tauri::command]
pub fn set_tray_language(app: AppHandle, locale: String) {
    refresh(&app, Some(TrayLanguage::from_locale(&locale)));
}

pub(crate) fn build_tray(app: &App) -> tauri::Result<()> {
    let [toggle_text, settings_text, quit_text] = labels(TrayLanguage::Chinese, true);
    let toggle = MenuItem::with_id(app, "toggle", toggle_text, true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", settings_text, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", quit_text, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle, &settings, &quit])?;
    app.manage(TrayMenu { toggle, settings, quit, shown: Mutex::new((TrayLanguage::Chinese, true)) });

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
                refresh(app, None);
            }
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
        .on_tray_icon_event(|tray, event| match event {
            // The cursor reaching the icon comes before any click, so the menu opens with the
            // right show / hide text even when the island was hidden some other way.
            TrayIconEvent::Enter { .. } | TrayIconEvent::Move { .. } => refresh(tray.app_handle(), None),
            TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } => {
                let _ = island::show_island(tray.app_handle());
                refresh(tray.app_handle(), None);
            }
            _ => {}
        });

    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }

    tray.build(app)?;
    Ok(())
}

macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::tray::set_tray_language,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;

#[cfg(test)]
mod tests {
    use super::{labels, TrayLanguage};

    #[test]
    fn the_menu_follows_the_language_and_names_what_the_toggle_will_do() {
        assert_eq!(TrayLanguage::from_locale("en"), TrayLanguage::English);
        assert_eq!(TrayLanguage::from_locale("en-US"), TrayLanguage::English);
        assert_eq!(TrayLanguage::from_locale("zh-CN"), TrayLanguage::Chinese);
        assert_eq!(TrayLanguage::from_locale("ja"), TrayLanguage::Chinese);
        assert_eq!(labels(TrayLanguage::Chinese, false), ["显示岛屿", "设置", "退出"]);
        assert_eq!(labels(TrayLanguage::Chinese, true)[0], "隐藏岛屿");
        assert_eq!(labels(TrayLanguage::English, false), ["Show Island", "Settings", "Quit"]);
        assert_eq!(labels(TrayLanguage::English, true)[0], "Hide Island");
    }
}
