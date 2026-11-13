import { colorsFrom, sameColors, type ColorPalette } from "./colorPalette.ts";
import { DEFAULT_SETTINGS } from "./settingsDefaults.ts";
import type { IslandSettings } from "./types";

type RefreshStorage = {
  completed: boolean;
  backup: ColorPalette | null;
  saveBackup: (colors: ColorPalette) => boolean;
  saveSettings: (settings: IslandSettings) => boolean;
  markComplete: () => boolean;
};

/** The backup is also a recovery record if saving settings or the final marker fails. */
export function refreshColors(
  settings: IslandSettings,
  previous: ColorPalette | null,
  storage: RefreshStorage,
): IslandSettings {
  if (storage.completed) return settings;
  if (!previous || sameColors(previous, DEFAULT_SETTINGS)) {
    storage.markComplete();
    return settings;
  }
  // Another window (or a retry after an interrupted write) must never replace this backup.
  if (!storage.backup && !storage.saveBackup(previous)) return { ...settings, ...previous };
  const next = { ...settings, ...colorsFrom(DEFAULT_SETTINGS) };
  if (storage.saveSettings(next)) storage.markComplete();
  return next;
}
