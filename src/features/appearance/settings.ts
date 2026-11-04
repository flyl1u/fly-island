import { clamp } from "../../utils/number.ts";
import { HEX_COLOR_PATTERN, getColorSetting } from "../../utils/color.ts";
import type { IslandPreset, IslandSettings, LegacyIslandSettings } from "./types";

export const MAX_CUSTOM_SETTING_PRESETS = 6;
export const MIN_TOP_FILLET_RADIUS = 0;
// The island window leaves room beside the island for fillets up to this size.
export const MAX_TOP_FILLET_RADIUS = 12;
// Bottom corner radius of the expanded island; every other island radius scales from it.
export const DEFAULT_ISLAND_CORNER_RADIUS = 30;
export const MIN_ISLAND_CORNER_RADIUS = 16;
export const MAX_ISLAND_CORNER_RADIUS = 40;
export const DEFAULT_HOVER_EXPAND_DELAY_MS = 300;
export const MIN_HOVER_EXPAND_DELAY_MS = 0;
export const MAX_HOVER_EXPAND_DELAY_MS = 1_000;
export const DEFAULT_HOVER_COLLAPSE_DELAY_MS = 400;
export const MIN_HOVER_COLLAPSE_DELAY_MS = 0;
export const MAX_HOVER_COLLAPSE_DELAY_MS = 2_000;
// Tallest panel before the todo list and other long pages scroll. The default is the
// height the todo page reached before this was a setting (six rows).
export const DEFAULT_MAX_PANEL_HEIGHT = 490;
// The todo page's height with no rows below its two fixed ones.
export const MIN_MAX_PANEL_HEIGHT = 306;
// The tallest expanded height the native window accepts.
export const MAX_MAX_PANEL_HEIGHT = 546;
export const DEFAULT_TASK_TEXT_COLOR = "#ffffff";
export const DEFAULT_SETTINGS: IslandSettings = {
  topEdgeLayoutVersion: 1,
  appearanceMode: "liquidGlass",
  fontFamily: "system",
  glassIntensity: 72,
  opacity: 95,
  collapsedScale: 0.89,
  expandedScale: 0.91,
  marginY: 0,
  topFilletRadius: 8,
  islandCornerRadius: DEFAULT_ISLAND_CORNER_RADIUS,
  maxPanelHeight: DEFAULT_MAX_PANEL_HEIGHT,
  taskTextColor: DEFAULT_TASK_TEXT_COLOR,
  pulseColor: "#3ae489",
  pulseBrightness: 100,
  islandBackgroundColor: "#2F2F37",
  todoBackgroundColor: "#ffffff",
  showTitle: false,
  showCollapsedText: true,
  showIdleTodoCount: true,
  carryOverIncompleteTodos: false,
  enableTodoReorder: false,
  rotateTodos: false,
  todoRotationSeconds: 5,
  autoTuck: false,
  autoTuckSeconds: 30,
  revealOnMessage: true,
  expandTrigger: "click",
  hoverExpandDelayMs: DEFAULT_HOVER_EXPAND_DELAY_MS,
  hoverCollapseDelayMs: DEFAULT_HOVER_COLLAPSE_DELAY_MS,
  minimizeAction: "tray",
  todoEnabled: true,
  musicEnabled: true,
  agentStatusEnabled: true,
  mailEnabled: true,
};
/**
 * Settings that belong to the appearance page. Resetting the appearance or applying a
 * preset changes only these, so todo and tuck behavior chosen on the general page survive.
 */
export const APPEARANCE_SETTING_KEYS = [
  "appearanceMode",
  "fontFamily",
  "glassIntensity",
  "opacity",
  "collapsedScale",
  "expandedScale",
  "marginY",
  "topFilletRadius",
  "islandCornerRadius",
  "maxPanelHeight",
  "taskTextColor",
  "pulseColor",
  "pulseBrightness",
  "islandBackgroundColor",
  "todoBackgroundColor",
  "showTitle",
  "showCollapsedText",
  "showIdleTodoCount",
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
    ? DEFAULT_SETTINGS.expandedScale
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
    collapsedScale: clamp(
      Number(collapsedScale),
      0.75,
      1.4,
    ),
    expandedScale: clamp(
      Number(expandedScale),
      0.75,
      1.4,
    ),
    marginY: clamp(
      Number(hasPreviousDefaultMargin ? DEFAULT_SETTINGS.marginY : marginY),
      0,
      160,
    ),
    topFilletRadius: typeof settings?.topFilletRadius === "number" && Number.isFinite(settings.topFilletRadius)
      ? clamp(Math.round(settings.topFilletRadius), MIN_TOP_FILLET_RADIUS, MAX_TOP_FILLET_RADIUS)
      : DEFAULT_SETTINGS.topFilletRadius,
    islandCornerRadius: typeof settings?.islandCornerRadius === "number" && Number.isFinite(settings.islandCornerRadius)
      ? clamp(Math.round(settings.islandCornerRadius), MIN_ISLAND_CORNER_RADIUS, MAX_ISLAND_CORNER_RADIUS)
      : DEFAULT_SETTINGS.islandCornerRadius,
    maxPanelHeight: typeof settings?.maxPanelHeight === "number" && Number.isFinite(settings.maxPanelHeight)
      ? clamp(Math.round(settings.maxPanelHeight), MIN_MAX_PANEL_HEIGHT, MAX_MAX_PANEL_HEIGHT)
      : DEFAULT_SETTINGS.maxPanelHeight,
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
    showIdleTodoCount:
      typeof settings?.showIdleTodoCount === "boolean"
        ? settings.showIdleTodoCount
        : DEFAULT_SETTINGS.showIdleTodoCount,
    carryOverIncompleteTodos:
      typeof settings?.carryOverIncompleteTodos === "boolean"
        ? settings.carryOverIncompleteTodos
        : DEFAULT_SETTINGS.carryOverIncompleteTodos,
    enableTodoReorder:
      typeof settings?.enableTodoReorder === "boolean"
        ? settings.enableTodoReorder
        : DEFAULT_SETTINGS.enableTodoReorder,
    rotateTodos: settings?.rotateTodos === true,
    todoRotationSeconds: typeof settings?.todoRotationSeconds === "number" && Number.isFinite(settings.todoRotationSeconds)
      ? clamp(Math.round(settings.todoRotationSeconds), 1, 3_600)
      : DEFAULT_SETTINGS.todoRotationSeconds,
    autoTuck: settings?.autoTuck === true,
    autoTuckSeconds: typeof settings?.autoTuckSeconds === "number" && Number.isFinite(settings.autoTuckSeconds)
      ? clamp(Math.round(settings.autoTuckSeconds), 1, 3_600)
      : DEFAULT_SETTINGS.autoTuckSeconds,
    revealOnMessage: settings?.revealOnMessage !== false,
    expandTrigger: settings?.expandTrigger === "hover" ? "hover" : "click",
    hoverExpandDelayMs: typeof settings?.hoverExpandDelayMs === "number" && Number.isFinite(settings.hoverExpandDelayMs)
      ? clamp(Math.round(settings.hoverExpandDelayMs), MIN_HOVER_EXPAND_DELAY_MS, MAX_HOVER_EXPAND_DELAY_MS)
      : DEFAULT_SETTINGS.hoverExpandDelayMs,
    hoverCollapseDelayMs: typeof settings?.hoverCollapseDelayMs === "number" && Number.isFinite(settings.hoverCollapseDelayMs)
      ? clamp(Math.round(settings.hoverCollapseDelayMs), MIN_HOVER_COLLAPSE_DELAY_MS, MAX_HOVER_COLLAPSE_DELAY_MS)
      : DEFAULT_SETTINGS.hoverCollapseDelayMs,
    minimizeAction: settings?.minimizeAction === "tuck" ? "tuck" : "tray",
    // Module switches: anything but an explicit false keeps the module on.
    todoEnabled: settings?.todoEnabled !== false,
    musicEnabled: settings?.musicEnabled !== false,
    agentStatusEnabled: settings?.agentStatusEnabled !== false,
    mailEnabled: settings?.mailEnabled !== false,
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
