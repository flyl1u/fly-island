import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

/** Saves a backup to the Downloads folder (never overwriting); resolves to the file's path. */
export function saveSettingsBackup(fileName: string, content: string) {
  return invoke<string>("save_settings_backup", { fileName, content });
}

/** Restarts the island so settings that are only read at start-up take effect. */
export function restartIsland() {
  return invoke<void>("restart_island");
}

/** Shows a saved backup in Explorer. */
export function revealBackup(path: string) {
  return revealItemInDir(path);
}
