import { HEX_COLOR_PATTERN } from "../../utils/color.ts";
import { normalizeAgentSettings } from "./normalizeAgentSettings.ts";
import { normalizeBehaviorSettings } from "./normalizeBehaviorSettings.ts";
import { normalizeLayoutSettings } from "./normalizeLayoutSettings.ts";
import { DEFAULT_SETTINGS } from "./settingsDefaults.ts";
import type { AppearanceMode, IslandSettings, LegacyIslandSettings } from "./types";

// Island settings (focusd-island-settings): limits in settingsLimits.ts, first-launch values in
// settingsDefaults.ts, and reading saved ones in normalize*Settings.ts by area. New settings go in
// those files; this one keeps the entry points other code imports.
export * from "./settingsLimits.ts";

/** Liquid glass is paused for now: the island draws classic and the option is hidden. */
export const LIQUID_GLASS_ENABLED = false;

/** The look actually drawn. A saved liquid glass preference is kept for when glass returns. */
export function getEffectiveAppearanceMode(mode: AppearanceMode): AppearanceMode {
  return mode === "liquidGlass" && !LIQUID_GLASS_ENABLED ? "classic" : mode;
}
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

export function hexToRgba(hex: string, alpha: number) {
  const normalized = HEX_COLOR_PATTERN.test(hex)
    ? hex.slice(1)
    : DEFAULT_SETTINGS.pulseColor.slice(1);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * Saved settings read back. Only what Settings can still change is read; everything else (the
 * options removed to keep Settings short) always loads as its default, whatever an older
 * version saved, so nobody is left with a value they can no longer change back.
 */
export function normalizeSettings(
  settings: LegacyIslandSettings | null | undefined,
): IslandSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...normalizeLayoutSettings(settings),
    ...normalizeAgentSettings(settings),
    ...normalizeBehaviorSettings(settings),
  };
}

export function isSameSettings(a: IslandSettings, b: IslandSettings) {
  return (Object.keys(a) as (keyof IslandSettings)[]).every(
    (key) => a[key] === b[key],
  );
}
