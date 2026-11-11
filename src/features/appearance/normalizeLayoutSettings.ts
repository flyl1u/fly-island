// Reading saved settings, part 1 (normalizeSettings in settings.ts): the island's look and size.
import { clamp } from "../../utils/number.ts";
import { getColorSetting } from "../../utils/color.ts";
import { DEFAULT_SETTINGS } from "./settingsDefaults.ts";
import { EXPANDED_SCALES, nearestExpandedSize } from "./settingsLimits.ts";
import type { IslandSettings, LegacyIslandSettings } from "./types";

/** The look that can still be set: style, font, opacity, the two sizes and the three colours. */
export function normalizeLayoutSettings(settings: LegacyIslandSettings | null | undefined) {
  const taskTextColor = getColorSetting(
    settings?.taskTextColor ?? settings?.pendingTodoColor,
    getColorSetting(settings?.taskTitleColor, DEFAULT_SETTINGS.taskTextColor),
  );
  const hasPreviousDefaultScales =
    settings?.collapsedScale === 0.81 && settings.expandedScale === 0.88;
  const collapsedScale = hasPreviousDefaultScales
    ? 0.82
    : settings?.collapsedScale ?? settings?.sizeScale ?? DEFAULT_SETTINGS.collapsedScale;
  return {
    topEdgeLayoutVersion: 1,
    fontFamily: settings?.fontFamily === "pixel" ? "pixel" : "system",
    appearanceMode:
      settings?.appearanceMode === "classic" ||
      settings?.appearanceMode === "liquidGlass"
        ? settings.appearanceMode
        : "classic",
    glassIntensity: clamp(
      Number(settings?.glassIntensity ?? DEFAULT_SETTINGS.glassIntensity),
      25,
      100,
    ),
    opacity: clamp(Number(settings?.opacity ?? DEFAULT_SETTINGS.opacity), 50, 100),
    collapsedScale: clamp(Number(collapsedScale), 0.75, 1.4),
    // One of three sizes; a scale saved by an older version lands on the nearest.
    expandedScale: EXPANDED_SCALES[nearestExpandedSize(Number(settings?.expandedScale ?? DEFAULT_SETTINGS.expandedScale))],
    taskTextColor,
    pulseColor: getColorSetting(
      settings?.pulseColor,
      DEFAULT_SETTINGS.pulseColor,
    ),
    islandBackgroundColor: getColorSetting(
      settings?.islandBackgroundColor,
      DEFAULT_SETTINGS.islandBackgroundColor,
    ),
  } satisfies Partial<IslandSettings>;
}
