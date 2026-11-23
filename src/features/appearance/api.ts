import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

/** Matches InstalledFont in src-tauri/src/system/fonts.rs. */
export type InstalledFont = { family: string; label: string };

export function listInstalledFonts(locale: string) {
  return invoke<InstalledFont[]>("list_installed_fonts", { locale });
}

/**
 * Saves a theme file to the Downloads folder (never overwriting); resolves to the file's path.
 */
export function saveThemeFile(fileName: string, content: string) {
  return invoke<string>("save_theme_file", { fileName, content });
}

/** Shows a saved theme file in Explorer. */
export function revealThemeFile(path: string) {
  return revealItemInDir(path);
}
