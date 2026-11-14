import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { loadDetachedSettings, requestSettingsFocus, type SettingsFocusSection } from "./storage";

// Mirrors SETTINGS_OPEN_REQUESTED_EVENT in src-tauri/src/settings_window/mod.rs: the tray
// and other windows ask the island to open settings where the user keeps them.
export const SETTINGS_OPEN_REQUESTED_EVENT = "settings-open-requested";
/** Same-window request from a part of the island to open its settings page. */
export const OPEN_SETTINGS_PAGE_EVENT = "focusd-open-settings-page";

const isMainWindow = new URLSearchParams(window.location.search).get("window") === null;

/**
 * Opens settings, on `section` when given: as a page of the island by default, or in
 * the standalone settings window when the user chose that (General → Separate window).
 */
export function openSettingsWindow(section?: SettingsFocusSection) {
  if (section) requestSettingsFocus(section);
  const opened = loadDetachedSettings()
    ? invoke<void>("open_settings_window")
    : isMainWindow
      ? Promise.resolve(void window.dispatchEvent(new Event(OPEN_SETTINGS_PAGE_EVENT)))
      : emitTo("main", SETTINGS_OPEN_REQUESTED_EVENT);
  void opened.catch((error) => {
    console.error("Failed to open settings", error);
  });
}

/** Opens (or brings forward) the standalone settings window. */
export function openStandaloneSettingsWindow() {
  return invoke<void>("open_settings_window");
}

/** Moves settings back into the island and closes the standalone window. */
export function dockSettingsWindow() {
  return invoke<void>("dock_settings_window");
}

export function listenSettingsOpenRequested(handler: () => void) {
  return listen(SETTINGS_OPEN_REQUESTED_EVENT, handler);
}

/** Draws this window's title bar and background in the page's colour scheme (settings_window/mod.rs). */
export function setSettingsWindowTheme(dark: boolean) {
  return invoke<void>("set_settings_window_theme", { dark });
}

/** Shows this window, which a fresh open creates hidden until the page has painted. */
export function showSettingsWindow() {
  return invoke("show_settings_window");
}

export function readLaunchAtStartup() {
  return invoke<boolean>("get_launch_at_startup");
}

export function saveLaunchAtStartup(enabled: boolean) {
  return invoke("set_launch_at_startup", { enabled });
}

/** Quits the island, as the tray menu's Quit does. */
export function quitIsland() {
  return invoke<void>("quit_island");
}
