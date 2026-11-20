import { DEFAULT_SETTINGS, normalizeSettings } from "./settings.ts";
import type { IslandSettings } from "./types";
import { readJson, readString, writeJson, writeString } from "../../lib/storage.ts";
import { getColorSetting } from "../../utils/color.ts";
import { colorsFrom, normalizeColorPalette, type ColorPalette } from "./colorPalette.ts";
import { refreshColors } from "./colorRefresh.ts";
import { normalizeColorPresets, type ColorPreset } from "./colorPresets.ts";

export const STORAGE_KEY = "fly-island-settings";
export const COLLAPSED_TEXT_DEFAULT_MIGRATION_KEY =
  "fly-island-collapsed-text-default-v1";
export const COLOR_REFRESH_KEY = "fly-island-color-refresh-v1";
export const COLOR_BACKUP_KEY = "fly-island-color-backup";
export const COLOR_PRESETS_KEY = "fly-island-color-presets";

export function loadSettings(): IslandSettings {
  // Read the marker before the snapshot: a concurrent refresh cannot make an old snapshot
  // look already migrated and then write those old colors back from the second window.
  const completed = readString(COLOR_REFRESH_KEY) === "1";
  const parsed = readJson(STORAGE_KEY);
  const hasArchive = !!parsed && typeof parsed === "object" && !Array.isArray(parsed);
  const saved = hasArchive ? parsed as Partial<IslandSettings> & { margin?: number } : null;
  let settings = saved ? normalizeSettings(saved) : DEFAULT_SETTINGS;
  const migrateCollapsedText = readString(COLLAPSED_TEXT_DEFAULT_MIGRATION_KEY) !== "1";
  if (migrateCollapsedText) {
    settings = { ...settings, showCollapsedText: true };
  }
  // Missing or invalid background fields used the old black default before this refresh.
  const previous = saved ? colorsFrom({
    ...settings,
    islandBackgroundColor: getColorSetting(saved.islandBackgroundColor, "#000000"),
  }) : null;
  const next = refreshColors(settings, previous, {
    completed,
    backup: loadColorBackup(),
    saveBackup: saveColorBackup,
    saveSettings,
    markComplete: () => writeString(COLOR_REFRESH_KEY, "1"),
  });
  // Do not persist the other migration until the old colors have been backed up.
  if (migrateCollapsedText && (!saved || saveSettings(next))) {
    writeString(COLLAPSED_TEXT_DEFAULT_MIGRATION_KEY, "1");
  }
  // The one-off moves of the tucked look to "line" and of the session sort to "recent" are gone
  // (2026-11-19): whenever their marker did not survive, they overwrote a choice the user had made
  // again after updating (owner: 露边 reset to 细线 twice in one day).
  return next;
}

export function saveSettings(settings: IslandSettings): boolean {
  return writeJson(STORAGE_KEY, settings);
}

export function loadColorBackup(): ColorPalette | null {
  return normalizeColorPalette(readJson(COLOR_BACKUP_KEY));
}

export function saveColorBackup(colors: ColorPalette): boolean {
  return writeJson(COLOR_BACKUP_KEY, colorsFrom(colors));
}

/** Bulk changes are applied only after their previous colors have been saved. */
export function withColorBackup(current: IslandSettings, next: IslandSettings): IslandSettings {
  return saveColorBackup(current) ? next : current;
}

export function swapColorBackup(current: IslandSettings): IslandSettings {
  const backup = loadColorBackup();
  return backup ? withColorBackup(current, { ...current, ...backup }) : current;
}

export function loadColorPresets(): ColorPreset[] {
  return normalizeColorPresets(readJson(COLOR_PRESETS_KEY));
}

export function saveColorPresets(presets: ColorPreset[]): boolean {
  return writeJson(COLOR_PRESETS_KEY, normalizeColorPresets(presets));
}
