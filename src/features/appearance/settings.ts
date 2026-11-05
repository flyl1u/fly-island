import { clamp } from "../../utils/number.ts";
import { HEX_COLOR_PATTERN, getColorSetting } from "../../utils/color.ts";
import type { IslandPreset, IslandSettings, LegacyIslandSettings } from "./types";

export const MAX_CUSTOM_SETTING_PRESETS = 6;
export const DEFAULT_TASK_TEXT_COLOR = "#ffffff";
export const DEFAULT_SETTINGS: IslandSettings = {
  topEdgeLayoutVersion: 1,
  appearanceMode: "classic",
  fontFamily: "system",
  glassIntensity: 72,
  opacity: 95,
  collapsedScale: 0.89,
  expandedScale: 0.91,
  marginY: 0,
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
};
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
