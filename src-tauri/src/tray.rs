//! System tray icon and menu. One item shows or hides the island, named for what
//! it will do: the visibility is checked whenever the cursor reaches the tray
//! icon, before the menu opens.

mod visibility;

use std::{sync::{Mutex, PoisonError}, thread, time::Duration};

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Emitter, Manager, Wry,
};

use crate::{island, settings_window};
use visibility::Visibility;

const TRAY_ID: &str = "fly-island";
// Mirrored in src/windows/settings/api.ts.
const VISIBILITY_EVENT: &str = "tray-visibility-changed";
const CHECK_UPDATES_EVENT: &str = "tray-check-updates";
const SYNC_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Clone, Copy)]
enum Language { Chinese, English }

impl Language {
    fn from_locale(locale: &str) -> Self {
        if locale == "en" { Self::English } else { Self::Chinese }
    }
}

#[derive(Debug, PartialEq, Eq)]
struct Labels {
    toggle: &'static str,
    settings: &'static str,
    updates: &'static str,
    hide_icon: &'static str,
    quit: &'static str,
}

/// The show / hide item's text for a visible or hidden island.
fn labels(language: Language, island_visible: bool) -> Labels {
    match language {
        Language::Chinese => Labels {
            toggle: if island_visible { "隐藏岛屿" } else { "显示岛屿" },
            settings: "设置", updates: "检查更新", hide_icon: "隐藏托盘图标", quit: "退出",
        },
        Language::English => Labels {
            toggle: if island_visible { "Hide Island" } else { "Show Island" },
            settings: "Settings", updates: "Check for updates", hide_icon: "Hide tray icon", quit: "Quit",
        },
    }
}

struct TrayMenu {
    toggle: MenuItem<Wry>,
    settings: MenuItem<Wry>,
    updates: MenuItem<Wry>,
    hide_icon: MenuItem<Wry>,
    quit: MenuItem<Wry>,
    state: Mutex<TrayState>,
}

struct TrayState {
    language: Language,
    /// The visibility the toggle text was last set for.
    shown: bool,
    visibility: Visibility,
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
    let mut state = menu.state.lock().unwrap_or_else(PoisonError::into_inner);
    if state.shown == visible {
        return;
    }
    if menu.toggle.set_text(labels(state.language, visible).toggle).is_ok() {
        state.shown = visible;
    }
}

pub(crate) fn build_tray(app: &App) -> tauri::Result<()> {
    let text = labels(Language::Chinese, true);
    let toggle = MenuItem::with_id(app, "toggle", text.toggle, true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", text.settings, true, None::<&str>)?;
    let updates = MenuItem::with_id(app, "updates", text.updates, true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let hide_icon = MenuItem::with_id(app, "hide-icon", text.hide_icon, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", text.quit, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle, &settings, &updates, &separator, &hide_icon, &quit])?;
    app.manage(TrayMenu { toggle, settings, updates, hide_icon, quit, state: Mutex::new(TrayState {
        language: Language::Chinese, shown: true, visibility: Visibility::default(),
    }) });

    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Fly Island")
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
            "updates" => { let _ = app.emit_to(island::WINDOW_LABEL, CHECK_UPDATES_EVENT, ()); }
            "hide-icon" => {
                if let Err(error) = update_visibility(app, Some(false)) { eprintln!("failed to hide tray icon: {error}"); }
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

    // Tauri 2's builder has no visible(false). Hide immediately after build, before setup returns.
    tray.build(app)?.set_visible(false)?;
    let handle = app.handle().clone();
    thread::spawn(move || {
        thread::sleep(SYNC_TIMEOUT);
        let queued = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            if let Err(error) = update_visibility(&queued, None) { eprintln!("failed to show fallback tray icon: {error}"); }
        });
    });
    Ok(())
}

/// All decisions and tray mutations run together on the UI thread: a late frontend sync cannot
/// race with a timeout queued earlier. The timeout never writes a saved preference.
fn update_visibility(app: &AppHandle, preference: Option<bool>) -> Result<(), String> {
    let menu = app.try_state::<TrayMenu>().ok_or("Tray menu is not ready.")?;
    let mut state = menu.state.lock().unwrap_or_else(PoisonError::into_inner);
    let Some(next) = state.visibility.next(preference) else { return Ok(()) };
    let tray = app.tray_by_id(TRAY_ID).ok_or("Tray icon is not ready.")?;
    tray.set_visible(next.visible).map_err(|error| error.to_string())?;
    state.visibility = next;
    drop(state);
    if preference.is_some() { let _ = app.emit(VISIBILITY_EVENT, next.visible); }
    Ok(())
}

async fn on_main_thread(app: AppHandle, apply: impl FnOnce(&AppHandle) -> Result<(), String> + Send + 'static) -> Result<(), String> {
    let (send, receive) = tokio::sync::oneshot::channel();
    let queued = app.clone();
    app.run_on_main_thread(move || { let _ = send.send(apply(&queued)); }).map_err(|error| error.to_string())?;
    receive.await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn set_tray_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    on_main_thread(app, move |app| update_visibility(app, Some(visible))).await
}

#[tauri::command]
pub async fn set_tray_language(app: AppHandle, language: String) -> Result<(), String> {
    on_main_thread(app, move |app| {
        let menu = app.try_state::<TrayMenu>().ok_or("Tray menu is not ready.")?;
        let mut state = menu.state.lock().unwrap_or_else(PoisonError::into_inner);
        let language = Language::from_locale(&language);
        let visible = island_visible(app);
        let text = labels(language, visible);
        for (item, label) in [(&menu.toggle, text.toggle), (&menu.settings, text.settings), (&menu.updates, text.updates), (&menu.hide_icon, text.hide_icon), (&menu.quit, text.quit)] {
            item.set_text(label).map_err(|error| error.to_string())?;
        }
        state.language = language;
        state.shown = visible;
        Ok(())
    }).await
}

pub(crate) fn on_relaunch(app: &AppHandle) {
    let _ = island::show_island(app);
    let hidden = app.try_state::<TrayMenu>().is_some_and(|menu| !menu.state.lock().unwrap_or_else(PoisonError::into_inner).visibility.visible);
    if hidden {
        if let Err(error) = settings_window::request(app) { eprintln!("failed to open settings after relaunch: {error}"); }
    }
}

macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)* crate::tray::set_tray_language, crate::tray::set_tray_visible,] $($rest)*)
    };
}
pub(crate) use tauri_commands;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_toggle_names_what_it_will_do() {
        assert_eq!(labels(Language::Chinese, true).toggle, "隐藏岛屿");
        assert_eq!(labels(Language::Chinese, false).toggle, "显示岛屿");
        assert_eq!(labels(Language::English, true).toggle, "Hide Island");
        assert_eq!(labels(Language::English, false).toggle, "Show Island");
    }

    #[test]
    fn the_menu_follows_the_interface_language() {
        assert_eq!(labels(Language::from_locale("zh-CN"), true), Labels {
            toggle: "隐藏岛屿", settings: "设置", updates: "检查更新", hide_icon: "隐藏托盘图标", quit: "退出",
        });
        assert_eq!(labels(Language::from_locale("en"), false), Labels {
            toggle: "Show Island", settings: "Settings", updates: "Check for updates", hide_icon: "Hide tray icon", quit: "Quit",
        });
        assert_eq!(labels(Language::from_locale("unsupported"), true).settings, "设置");
    }
}
