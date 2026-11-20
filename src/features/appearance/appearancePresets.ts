import { readJson, writeJson } from "../../lib/storage.ts";
import { APPEARANCE_SETTING_KEYS, normalizeSettings, withAppearanceFrom } from "./settings.ts";
import type { IslandSettings, LegacyIslandSettings } from "./types";

// Whole-look presets: every appearance setting (APPEARANCE_SETTING_KEYS) saved under a name.
// Stored as fly-island-appearance-presets; applying one reads it back through normalizeSettings,
// so a damaged or older record falls back to defaults for what it lacks.
export const APPEARANCE_PRESETS_KEY = "fly-island-appearance-presets";
export const MAX_APPEARANCE_PRESETS = 8;
export const APPEARANCE_PRESET_NAME_LIMIT = 20;

export type AppearanceSnapshot = Pick<IslandSettings, (typeof APPEARANCE_SETTING_KEYS)[number]>;
export type AppearancePreset = { id: string; name: string; settings: AppearanceSnapshot };

export function snapshotAppearance(settings: IslandSettings): AppearanceSnapshot {
  return Object.fromEntries(APPEARANCE_SETTING_KEYS.map((key) => [key, settings[key]])) as AppearanceSnapshot;
}

/** Records that are not objects with an id, a name and settings are dropped; ids stay unique. */
export function normalizeAppearancePresets(value: unknown): AppearancePreset[] {
  if (!Array.isArray(value)) return [];
  const presets: AppearancePreset[] = [];
  for (const item of value as unknown[]) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const { id, name, settings } = record;
    if (typeof id !== "string" || !id.trim()) continue;
    if (typeof name !== "string" || !name.trim()) continue;
    if (!settings || typeof settings !== "object") continue;
    if (presets.some((preset) => preset.id === id)) continue;
    presets.push({ id, name: name.trim().slice(0, APPEARANCE_PRESET_NAME_LIMIT), settings: settings as AppearanceSnapshot });
    if (presets.length === MAX_APPEARANCE_PRESETS) break;
  }
  return presets;
}

/** The list with one more preset; unchanged (same reference) when the name is empty or the list is full. */
export function addAppearancePreset(presets: AppearancePreset[], name: string, settings: IslandSettings, id: string): AppearancePreset[] {
  const trimmed = name.trim();
  if (!trimmed || !id.trim() || presets.length >= MAX_APPEARANCE_PRESETS) return presets;
  return [...presets, { id, name: trimmed.slice(0, APPEARANCE_PRESET_NAME_LIMIT), settings: snapshotAppearance(settings) }];
}

export function removeAppearancePreset(presets: AppearancePreset[], id: string): AppearancePreset[] {
  return presets.filter((preset) => preset.id !== id);
}

/** `current` with the preset's appearance applied; every other setting (todo, tuck, agent) is kept. */
export function applyAppearancePreset(current: IslandSettings, preset: AppearancePreset): IslandSettings {
  // On top of the current settings: what a preset saved before a setting joined the appearance
  // (the tucked look, 2026-11-19) keeps its current value instead of falling back to the default.
  return withAppearanceFrom(current, normalizeSettings({ ...current, ...preset.settings } as LegacyIslandSettings));
}

export function loadAppearancePresets(): AppearancePreset[] {
  return normalizeAppearancePresets(readJson(APPEARANCE_PRESETS_KEY));
}

export function saveAppearancePresets(presets: AppearancePreset[]): boolean {
  return writeJson(APPEARANCE_PRESETS_KEY, normalizeAppearancePresets(presets));
}
