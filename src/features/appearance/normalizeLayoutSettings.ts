// Reading saved settings, part 1 (normalizeSettings in settings.ts): the island's look and size.
import { clamp } from "../../utils/number.ts";
import { getColorSetting } from "../../utils/color.ts";
import { DEFAULT_SETTINGS } from "./settingsDefaults.ts";
import { CLIPBOARD_VISIBLE_ROWS, COLLAPSED_HEIGHT, COLLAPSED_WIDTH, ISLAND_FONT_PERCENT, MAX_COLLAPSED_SCALE, MIN_COLLAPSED_SCALE, TOP_EDGE_SHOULDER_SIZE, normalizeExpandedScale } from "./settingsLimits.ts";
import type { IslandSettings, LegacyIslandSettings } from "./types";

function normalizeSize(value: unknown, limits: { min: number; max: number; default: number; step?: number }) {
  if (typeof value !== "number" || !Number.isFinite(value)) return limits.default;
  const step = limits.step ?? 1;
  return clamp(Math.round(value / step) * step, limits.min, limits.max);
}

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
    islandFontPercent: normalizeSize(settings?.islandFontPercent, ISLAND_FONT_PERCENT),
    pageButtonStyle: settings?.pageButtonStyle === "capsule" ? "capsule" : DEFAULT_SETTINGS.pageButtonStyle,
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
    collapsedScale: clamp(Number(collapsedScale), MIN_COLLAPSED_SCALE, MAX_COLLAPSED_SCALE),
    collapsedAutoWidth: settings?.collapsedAutoWidth !== false,
    collapsedWidth: normalizeSize(settings?.collapsedWidth, COLLAPSED_WIDTH),
    collapsedHeight: normalizeSize(settings?.collapsedHeight, COLLAPSED_HEIGHT),
    // On the slider's range; the three sizes of 3.0.0 keep their value.
    expandedScale: normalizeExpandedScale(settings?.expandedScale ?? DEFAULT_SETTINGS.expandedScale),
    taskTextColor,
    pulseColor: getColorSetting(
      settings?.pulseColor,
      DEFAULT_SETTINGS.pulseColor,
    ),
    islandBackgroundColor: getColorSetting(
      settings?.islandBackgroundColor,
      DEFAULT_SETTINGS.islandBackgroundColor,
    ),
    // Optional top-edge shoulders; invalid archives keep the default silhouette.
    topEdgeShoulders: typeof settings?.topEdgeShoulders === "boolean" ? settings.topEdgeShoulders : DEFAULT_SETTINGS.topEdgeShoulders,
    topEdgeShoulderSize: normalizeSize(settings?.topEdgeShoulderSize, TOP_EDGE_SHOULDER_SIZE),
    // Clipboard: retain the user's visible row count, including older saved values.
    clipboardVisibleRows: normalizeSize(settings?.clipboardVisibleRows, CLIPBOARD_VISIBLE_ROWS),
  } satisfies Partial<IslandSettings>;
}
