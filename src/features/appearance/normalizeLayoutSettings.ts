// Reading saved settings, part 1 (normalizeSettings in settings.ts): the island's look and size.
import { clamp } from "../../utils/number.ts";
import { getColorSetting } from "../../utils/color.ts";
import { DEFAULT_SETTINGS, LEGACY_FALLBACKS } from "./settingsDefaults.ts";
import {
  MAX_CLIPBOARD_VISIBLE_ROWS, MAX_ISLAND_CORNER_RADIUS, MAX_MAX_PANEL_HEIGHT,
  MIN_CLIPBOARD_VISIBLE_ROWS, MIN_ISLAND_CORNER_RADIUS, MIN_MAX_PANEL_HEIGHT,
} from "./settingsLimits.ts";
import type { IslandSettings, LegacyIslandSettings } from "./types";

/** The look and size: scales, margin, corners, panel height, colours, what the bar shows. */
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
  const expandedScale = hasPreviousDefaultScales
    ? 1.05 // The default these settings moved to back then, not today's.
    : settings?.expandedScale ?? settings?.sizeScale ?? DEFAULT_SETTINGS.expandedScale;
  const marginY = settings?.marginY ?? settings?.margin ?? DEFAULT_SETTINGS.marginY;
  const hasPreviousDefaultMargin =
    settings?.topEdgeLayoutVersion !== 1 && (marginY === 31 || marginY === 12);

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
    expandedScale: clamp(Number(expandedScale), 0.75, 1.4),
    islandMonitor: settings?.islandMonitor === "cursor" || settings?.islandMonitor === "foreground" ? settings.islandMonitor : "primary",
    marginY: clamp(
      Number(hasPreviousDefaultMargin ? DEFAULT_SETTINGS.marginY : marginY),
      0,
      160,
    ),
    islandCornerRadius: typeof settings?.islandCornerRadius === "number" && Number.isFinite(settings.islandCornerRadius)
      ? clamp(Math.round(settings.islandCornerRadius), MIN_ISLAND_CORNER_RADIUS, MAX_ISLAND_CORNER_RADIUS)
      : LEGACY_FALLBACKS.islandCornerRadius,
    // Squircle for upgrades too: it replaced the round corners as the island's look.
    islandCornerShape: settings?.islandCornerShape === "round" ? "round" : "squircle",
    maxPanelHeight: typeof settings?.maxPanelHeight === "number" && Number.isFinite(settings.maxPanelHeight)
      ? clamp(Math.round(settings.maxPanelHeight), MIN_MAX_PANEL_HEIGHT, MAX_MAX_PANEL_HEIGHT)
      : DEFAULT_SETTINGS.maxPanelHeight,
    clipboardVisibleRows: typeof settings?.clipboardVisibleRows === "number" && Number.isFinite(settings.clipboardVisibleRows)
      ? clamp(Math.round(settings.clipboardVisibleRows), MIN_CLIPBOARD_VISIBLE_ROWS, MAX_CLIPBOARD_VISIBLE_ROWS)
      : LEGACY_FALLBACKS.clipboardVisibleRows,
    taskTextColor,
    pulseColor: getColorSetting(
      settings?.pulseColor,
      DEFAULT_SETTINGS.pulseColor,
    ),
    pulseBrightness: clamp(
      Number(settings?.pulseBrightness ?? DEFAULT_SETTINGS.pulseBrightness),
      50,
      160,
    ),
    islandBackgroundColor: getColorSetting(
      settings?.islandBackgroundColor,
      DEFAULT_SETTINGS.islandBackgroundColor,
    ),
    todoBackgroundColor: getColorSetting(
      settings?.todoBackgroundColor,
      DEFAULT_SETTINGS.todoBackgroundColor,
    ),
    showTitle:
      typeof settings?.showTitle === "boolean"
        ? settings.showTitle
        : DEFAULT_SETTINGS.showTitle,
    showCollapsedText:
      typeof settings?.showCollapsedText === "boolean"
        ? settings.showCollapsedText
        : DEFAULT_SETTINGS.showCollapsedText,
  } satisfies Partial<IslandSettings>;
}
