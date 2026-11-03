import { invoke } from "@tauri-apps/api/core";
import { SETTINGS_FOCUS_STORAGE_KEY, type SettingsFocusSection } from "./storage";

export function openSettingsWindow(section?: SettingsFocusSection) {
  if (section) {
    window.localStorage.setItem(
      SETTINGS_FOCUS_STORAGE_KEY,
      JSON.stringify({ section, requestedAt: Date.now() }),
    );
  }

  void invoke("open_settings_window").catch((error) => {
    console.error("Failed to open settings window", error);
  });
}
