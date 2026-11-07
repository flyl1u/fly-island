import { HEX_COLOR_PATTERN } from "../../utils/color.ts";
import { normalizeAgentSettings } from "./normalizeAgentSettings.ts";
import { normalizeBehaviorSettings } from "./normalizeBehaviorSettings.ts";
import { normalizeLayoutSettings } from "./normalizeLayoutSettings.ts";
import { DEFAULT_SETTINGS } from "./settingsDefaults.ts";
import { MAX_CUSTOM_SETTING_PRESETS } from "./settingsLimits.ts";
import type { IslandPreset, IslandSettings, LegacyIslandSettings } from "./types";

// Island settings (focusd-island-settings): limits in settingsLimits.ts, first-launch values in
// settingsDefaults.ts, and reading saved ones in normalize*Settings.ts by area. New settings go in
// those files; this one keeps the entry points other code imports.
export * from "./settingsLimits.ts";
export { DEFAULT_SETTINGS } from "./settingsDefaults.ts";

/**
 * Settings that belong to the appearance page. Resetting the appearance or applying a
 * preset changes only these, so todo and tuck behavior chosen on the general page survive.
 * The top margin (general page) and the idle todo count (todos page) are not among them,
 * so presets saved with those values no longer move the island or change the count.
 */
export const APPEARANCE_SETTING_KEYS = [
  "appearanceMode",
  "fontFamily",
  "glassIntensity",
  "opacity",
  "collapsedScale",
  "expandedScale",
  "topFilletRadius",
  "islandCornerRadius",
  "islandCornerShape",
  "maxPanelHeight",
  "taskTextColor",
  "pulseColor",
  "pulseBrightness",
  "islandBackgroundColor",
  "todoBackgroundColor",
  "showTitle",
  "showCollapsedText",
] as const satisfies readonly (keyof IslandSettings)[];

type AppearanceSettings = Pick<IslandSettings, (typeof APPEARANCE_SETTING_KEYS)[number]>;

/** `settings` with its appearance fields taken from `source`. */
export function withAppearanceFrom(settings: IslandSettings, source: IslandSettings): IslandSettings {
  const appearance = Object.fromEntries(
    APPEARANCE_SETTING_KEYS.map((key) => [key, source[key]]),
  ) as AppearanceSettings;

  return { ...settings, ...appearance };
}

export const LEGACY_DEFAULT_PRESET_IDS = new Set(["default-white", "default-khaki"]);
export const LEGACY_DEFAULT_PRESET_NAMES = new Set(["白色", "卡其"]);

export function hexToRgba(hex: string, alpha: number) {
  const normalized = HEX_COLOR_PATTERN.test(hex)
    ? hex.slice(1)
    : DEFAULT_SETTINGS.pulseColor.slice(1);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function normalizeSettings(
  settings: LegacyIslandSettings | null | undefined,
): IslandSettings {
  return {
    ...normalizeLayoutSettings(settings),
    ...normalizeAgentSettings(settings),
    ...normalizeBehaviorSettings(settings),
  };
}

export function getDefaultSettingPresets(): IslandPreset[] {
  return [];
}

export function mergeWithDefaultSettingPresets(presets: IslandPreset[]) {
  const defaultPresets = getDefaultSettingPresets();
  const customPresets = presets
    .filter(
      (preset) =>
        !preset.isDefault &&
        !LEGACY_DEFAULT_PRESET_IDS.has(preset.id) &&
        !LEGACY_DEFAULT_PRESET_NAMES.has(preset.name.trim()),
    )
    .map((preset) => ({ ...preset, isDefault: false }))
    .slice(0, MAX_CUSTOM_SETTING_PRESETS);

  return [...defaultPresets, ...customPresets];
}

export function isDefaultSettingPreset(presetId: string) {
  return LEGACY_DEFAULT_PRESET_IDS.has(presetId);
}

export function isSameSettings(a: IslandSettings, b: IslandSettings) {
  return (Object.keys(a) as (keyof IslandSettings)[]).every(
    (key) => a[key] === b[key],
  );
}
