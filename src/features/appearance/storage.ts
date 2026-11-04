import { readString, writeString } from "../../lib/storage.ts";
import type { Translations } from "../../i18n";
import { createTodoId } from "../todos/index.ts";
import { DEFAULT_SETTINGS, getDefaultSettingPresets, mergeWithDefaultSettingPresets, normalizeSettings } from "./settings.ts";
import type { IslandPreset, IslandSettings } from "./types";

export const STORAGE_KEY = "focusd-island-settings";
export const COLLAPSED_TEXT_DEFAULT_MIGRATION_KEY =
  "focusd-island-collapsed-text-default-v1";
export const SETTINGS_PRESETS_STORAGE_KEY = "focusd-island-setting-presets";

export function loadSettings(): IslandSettings {
  const stored = readString(STORAGE_KEY);

  if (!stored) {
    writeString(COLLAPSED_TEXT_DEFAULT_MIGRATION_KEY, "1");
    return DEFAULT_SETTINGS;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<IslandSettings> & {
      margin?: number;
    };
    const normalized = normalizeSettings(parsed);

    if (
      readString(COLLAPSED_TEXT_DEFAULT_MIGRATION_KEY) !== "1"
    ) {
      const migrated = { ...normalized, showCollapsedText: true };
      writeString(STORAGE_KEY, JSON.stringify(migrated));
      writeString(COLLAPSED_TEXT_DEFAULT_MIGRATION_KEY, "1");
      return migrated;
    }

    return normalized;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function loadSettingPresets(t: Translations): IslandPreset[] {
  const stored = readString(SETTINGS_PRESETS_STORAGE_KEY);

  if (!stored) {
    return getDefaultSettingPresets();
  }

  try {
    const parsed = JSON.parse(stored) as Partial<IslandPreset>[];

    if (!Array.isArray(parsed)) {
      return getDefaultSettingPresets();
    }

    const presets = parsed
      .map((preset, index) => ({
        id:
          typeof preset.id === "string" && preset.id
            ? preset.id
            : createTodoId(),
        name:
          typeof preset.name === "string" && preset.name.trim()
            ? preset.name.trim()
            : t.settings.presets.defaultName(index + 1),
        settings: normalizeSettings(preset.settings),
        createdAt:
          typeof preset.createdAt === "number" ? preset.createdAt : Date.now(),
        isDefault: false,
      }));

    return mergeWithDefaultSettingPresets(presets);
  } catch {
    return getDefaultSettingPresets();
  }
}

export function saveSettings(settings: IslandSettings) {
  writeString(STORAGE_KEY, JSON.stringify(settings));
}

export function saveSettingPresets(presets: IslandPreset[]) {
  writeString(
    SETTINGS_PRESETS_STORAGE_KEY,
    JSON.stringify(presets),
  );
}
