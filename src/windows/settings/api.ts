import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { requestSettingsFocus, type SettingsFocusSection } from "./storage";

export function openSettingsWindow(section?: SettingsFocusSection) {
  if (section) {
    requestSettingsFocus(section);
  }

  return invoke<void>("open_settings_window");
}

export function dockSettingsWindow() {
  return invoke<void>("dock_settings_window");
}

export function listenSettingsOpenRequested(handler: () => void) {
  return listen("settings-open-requested", handler);
}

export function readLaunchAtStartup() {
  return invoke<boolean>("get_launch_at_startup");
}

export function saveLaunchAtStartup(enabled: boolean) {
  return invoke("set_launch_at_startup", { enabled });
}
