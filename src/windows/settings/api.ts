import { invoke } from "@tauri-apps/api/core";
import { requestSettingsFocus, type SettingsFocusSection } from "./storage";

export function openSettingsWindow(section?: SettingsFocusSection) {
  if (section) {
    requestSettingsFocus(section);
  }

  void invoke("open_settings_window").catch((error) => {
    console.error("Failed to open settings window", error);
  });
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
