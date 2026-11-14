import { HEX_COLOR_PATTERN } from "../../utils/color.ts";
import { normalizeAgentSettings } from "./normalizeAgentSettings.ts";
import { normalizeBehaviorSettings } from "./normalizeBehaviorSettings.ts";
import { normalizeLayoutSettings } from "./normalizeLayoutSettings.ts";
import { DEFAULT_SETTINGS } from "./settingsDefaults.ts";
import type { IslandSettings, LegacyIslandSettings, Material } from "./types";

// Island settings (focusd-island-settings): limits in settingsLimits.ts, first-launch values in
// settingsDefaults.ts, and reading saved ones in normalize*Settings.ts by area. New settings go in
// those files; this one keeps the entry points other code imports.
export * from "./settingsLimits.ts";

/** Whether a material is one of the glasses (the glass strength applies, the native side is told). */
export function isGlass(material: Material) {
  return material !== "classic";
}

/**
 * How opaque a glass's tint is at full island opacity: liquid glass is nearly clear (clearer as the
 * strength rises), frosted glass mostly hides what is behind it. Drawn by the island and its preview.
 */
export function glassTintAlpha(material: Material, glassIntensity: number) {
  const strength = glassIntensity / 100;
  return material === "liquidGlass" ? 0.58 - strength * 0.3 : 0.9 - strength * 0.16;
}
export { DEFAULT_SETTINGS } from "./settingsDefaults.ts";

/**
 * Settings that belong to the appearance page. Resetting the appearance or applying a
 * preset changes only these, so todo and tuck behavior chosen on the general page survive.
 * The top margin (general page) and the idle todo count (todos page) are not among them,
 * so presets saved with those values no longer move the island or change the count.
 */
export const APPEARANCE_SETTING_KEYS = [
  "material",
  "colorScheme",
  "fontFamily",
  "islandFontPercent",
  "pageButtonStyle",
  "glassIntensity",
  "opacity",
  "collapsedScale",
  "collapsedAutoWidth",
  "collapsedWidth",
  "collapsedHeight",
  "expandedScale",
  "islandCornerRadius",
  "islandCornerShape",
  "topEdgeShoulders",
  "topEdgeShoulderSize",
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
  return (Object.keys(a) as (keyof IslandSettings)[]).every((key) => {
    const [left, right] = [a[key], b[key]];
    // The orders (collapsedPriority, collapsedLayout, pageOrder) are arrays, read back as new ones each time.
    return left === right || (Array.isArray(left) && Array.isArray(right) && left.join() === right.join());
  });
}
