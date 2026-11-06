import { clamp } from "../../utils/number.ts";
import { DEFAULT_PAGE_DIGIT_MODIFIERS, DEFAULT_PAGE_NEXT_SHORTCUT, DEFAULT_PAGE_PREVIOUS_SHORTCUT, normalizePageCycleShortcut, normalizePageDigitModifiers } from "./pageShortcuts.ts";
import { HEX_COLOR_PATTERN, getColorSetting } from "../../utils/color.ts";
import type { AgentHostDisplay, IslandPreset, IslandSettings, LegacyIslandSettings } from "./types";

export const AGENT_HOST_DISPLAYS: readonly AgentHostDisplay[] = ["both", "icon", "name", "off"];
/** Choices for how far back the Agent page lists sessions, in hours. */
export const AGENT_SESSION_HOURS = [1, 2, 6, 24] as const;
/** How long a page opened for an agent alert stays, in seconds. */
export const AGENT_ALERT_SECONDS = [3, 5, 8, 15, 30] as const;

export const MAX_CUSTOM_SETTING_PRESETS = 6;
export const MIN_TOP_FILLET_RADIUS = 0;
// The island window leaves room beside the island for fillets up to this size.
export const MAX_TOP_FILLET_RADIUS = 12;
// Bottom corner radius of the expanded island; every other island radius scales from it.
export const DEFAULT_ISLAND_CORNER_RADIUS = 16;
export const MIN_ISLAND_CORNER_RADIUS = 16;
export const MAX_ISLAND_CORNER_RADIUS = 40;
export const DEFAULT_HOVER_EXPAND_DELAY_MS = 0;
export const MIN_HOVER_EXPAND_DELAY_MS = 0;
export const MAX_HOVER_EXPAND_DELAY_MS = 1_000;
export const DEFAULT_HOVER_COLLAPSE_DELAY_MS = 0;
export const MIN_HOVER_COLLAPSE_DELAY_MS = 0;
export const MAX_HOVER_COLLAPSE_DELAY_MS = 2_000;
export const DEFAULT_AUTO_TUCK_RETRACT_DELAY_MS = 500;
export const MIN_AUTO_TUCK_RETRACT_DELAY_MS = 0;
export const MAX_AUTO_TUCK_RETRACT_DELAY_MS = 3_000;
// Tallest panel before the todo list and other long pages scroll. The default is the
// height the todo page reached before this was a setting (six rows).
export const DEFAULT_MAX_PANEL_HEIGHT = 490;
// The todo page's height with no rows below its two fixed ones.
export const MIN_MAX_PANEL_HEIGHT = 306;
// The tallest expanded height the native window accepts.
export const MAX_MAX_PANEL_HEIGHT = 546;
export const DEFAULT_CLIPBOARD_VISIBLE_ROWS = 6;
export const MIN_CLIPBOARD_VISIBLE_ROWS = 2;
// Six rows is the tallest clipboard page the native window accepts (656px).
export const MAX_CLIPBOARD_VISIBLE_ROWS = 6;
export const DEFAULT_AGENT_VISIBLE_ROWS = 2;
export const MIN_AGENT_VISIBLE_ROWS = 2;
// Five sessions is the tallest Agent page the native window accepts (627px of 656px).
export const MAX_AGENT_VISIBLE_ROWS = 5;
// File shelf cap; matches MAX_ITEMS and MIN / MAX_MAX_ITEMS in src-tauri/src/file_shelf/store.rs.
export const DEFAULT_SHELF_ITEMS = 100;
export const MIN_SHELF_ITEMS = 20;
export const MAX_SHELF_ITEMS = 200;
/** Auto-cleanup choices for the file shelf, in days; 0 never cleans up. */
export const SHELF_CLEANUP_DAYS = [0, 1, 7, 30] as const;
export const DEFAULT_TASK_TEXT_COLOR = "#ffffff";
// First-launch settings. A saved setting that lacks a newer field keeps the
// fallback in normalizeSettings, which for behavior switches is what older
// versions did, so upgrading never flips them.
export const DEFAULT_SETTINGS: IslandSettings = {
  topEdgeLayoutVersion: 1,
  appearanceMode: "classic",
  fontFamily: "system",
  glassIntensity: 72,
  opacity: 100,
  collapsedScale: 0.96,
  expandedScale: 1.05,
  marginY: 0,
  topFilletRadius: 12,
  islandCornerRadius: DEFAULT_ISLAND_CORNER_RADIUS,
  islandCornerShape: "squircle",
  maxPanelHeight: DEFAULT_MAX_PANEL_HEIGHT,
  clipboardVisibleRows: DEFAULT_CLIPBOARD_VISIBLE_ROWS,
  agentVisibleRows: DEFAULT_AGENT_VISIBLE_ROWS,
  agentHostDisplay: "both",
  agentSessionHours: 2,
  agentShowClaudeCode: true,
  agentShowCodex: true,
  agentHideFinished: false,
  // Off unless asked for: the age alone keeps finished rows short.
  agentShowElapsed: false,
  agentShowModel: true,
  agentShowActivity: true,
  agentShowUsage: true,
  agentAlertCompleted: true,
  agentAlertFailed: true,
  agentAlertWaiting: true,
  agentAlertStarted: "everyTurn",
  agentAlertSeconds: 5,
  taskTextColor: DEFAULT_TASK_TEXT_COLOR,
  pulseColor: "#3ae489",
  pulseBrightness: 100,
  islandBackgroundColor: "#030303",
  todoBackgroundColor: "#ffffff",
  showTitle: false,
  showCollapsedText: true,
  showIdleTodoCount: true,
  carryOverIncompleteTodos: false,
  enableTodoReorder: false,
  rotateTodos: false,
  todoRotationSeconds: 5,
  autoTuck: true,
  autoTuckSeconds: 30,
  autoTuckRetract: true,
  autoTuckRetractDelayMs: DEFAULT_AUTO_TUCK_RETRACT_DELAY_MS,
  revealOnMessage: true,
  expandTrigger: "hover",
  hoverExpandDelayMs: DEFAULT_HOVER_EXPAND_DELAY_MS,
  hoverCollapseDelayMs: DEFAULT_HOVER_COLLAPSE_DELAY_MS,
  minimizeAction: "tuck",
  tuckedHoverAction: "reveal",
  pageDigitModifiers: DEFAULT_PAGE_DIGIT_MODIFIERS,
  pageNextShortcut: DEFAULT_PAGE_NEXT_SHORTCUT,
  pagePreviousShortcut: DEFAULT_PAGE_PREVIOUS_SHORTCUT,
  todoEnabled: true,
  musicEnabled: true,
  agentStatusEnabled: true,
  agentTitleEnabled: true,
  shelfEnabled: true,
  translationEnabled: true,
  translationTarget: "island",
  shelfExpandOnDrop: true,
  shelfAutoCleanupDays: 0,
  shelfRemoveMissing: true,
  shelfRemoveAfterDragOut: true,
  shelfMaxItems: DEFAULT_SHELF_ITEMS,
  shelfDoubleClick: "open",
  shelfShowCount: true,
  deviceUseIndicator: true,
  levelPopup: true,
  mailEnabled: true,
  gameDoNotDisturb: true,
  gameAutoTuck: false,
};
// What versions before these fields existed showed. A saved setting without the
// field loads as this, not as the first-launch default, so an upgrade keeps the look.
const LEGACY_FALLBACKS = {
  topFilletRadius: 8,
  islandCornerRadius: 30,
  clipboardVisibleRows: 3,
  agentVisibleRows: 3,
  hoverExpandDelayMs: 300,
  hoverCollapseDelayMs: 400,
} as const satisfies Partial<IslandSettings>;
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
      : LEGACY_FALLBACKS.topFilletRadius,
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
    agentVisibleRows: typeof settings?.agentVisibleRows === "number" && Number.isFinite(settings.agentVisibleRows)
      ? clamp(Math.round(settings.agentVisibleRows), MIN_AGENT_VISIBLE_ROWS, MAX_AGENT_VISIBLE_ROWS)
      : LEGACY_FALLBACKS.agentVisibleRows,
    agentHostDisplay: AGENT_HOST_DISPLAYS.includes(settings?.agentHostDisplay as AgentHostDisplay)
      ? (settings?.agentHostDisplay as AgentHostDisplay)
      : DEFAULT_SETTINGS.agentHostDisplay,
    agentSessionHours: (AGENT_SESSION_HOURS as readonly unknown[]).includes(settings?.agentSessionHours)
      ? (settings?.agentSessionHours as number)
      : DEFAULT_SETTINGS.agentSessionHours,
    agentShowClaudeCode: settings?.agentShowClaudeCode !== false,
    agentShowCodex: settings?.agentShowCodex !== false,
    agentHideFinished: settings?.agentHideFinished === true,
    agentShowElapsed: settings?.agentShowElapsed === true,
    agentShowModel: settings?.agentShowModel !== false,
    agentShowActivity: settings?.agentShowActivity !== false,
    agentShowUsage: settings?.agentShowUsage !== false,
    agentAlertCompleted: settings?.agentAlertCompleted !== false,
    agentAlertFailed: settings?.agentAlertFailed !== false,
    agentAlertWaiting: settings?.agentAlertWaiting !== false,
    agentAlertStarted: settings?.agentAlertStarted === "newSession" || settings?.agentAlertStarted === "off" ? settings.agentAlertStarted : "everyTurn",
    agentAlertSeconds: (AGENT_ALERT_SECONDS as readonly unknown[]).includes(settings?.agentAlertSeconds)
      ? (settings?.agentAlertSeconds as number)
      : DEFAULT_SETTINGS.agentAlertSeconds,
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
    autoTuckRetract: settings?.autoTuckRetract !== false,
    autoTuckRetractDelayMs: typeof settings?.autoTuckRetractDelayMs === "number" && Number.isFinite(settings.autoTuckRetractDelayMs)
      ? clamp(Math.round(settings.autoTuckRetractDelayMs), MIN_AUTO_TUCK_RETRACT_DELAY_MS, MAX_AUTO_TUCK_RETRACT_DELAY_MS)
      : DEFAULT_SETTINGS.autoTuckRetractDelayMs,
    revealOnMessage: settings?.revealOnMessage !== false,
    expandTrigger: settings?.expandTrigger === "hover" ? "hover" : "click",
    hoverExpandDelayMs: typeof settings?.hoverExpandDelayMs === "number" && Number.isFinite(settings.hoverExpandDelayMs)
      ? clamp(Math.round(settings.hoverExpandDelayMs), MIN_HOVER_EXPAND_DELAY_MS, MAX_HOVER_EXPAND_DELAY_MS)
      : LEGACY_FALLBACKS.hoverExpandDelayMs,
    hoverCollapseDelayMs: typeof settings?.hoverCollapseDelayMs === "number" && Number.isFinite(settings.hoverCollapseDelayMs)
      ? clamp(Math.round(settings.hoverCollapseDelayMs), MIN_HOVER_COLLAPSE_DELAY_MS, MAX_HOVER_COLLAPSE_DELAY_MS)
      : LEGACY_FALLBACKS.hoverCollapseDelayMs,
    minimizeAction: settings?.minimizeAction === "tuck" ? "tuck" : "tray",
    tuckedHoverAction: settings?.tuckedHoverAction === "expand" ? "expand" : "reveal",
    pageDigitModifiers: normalizePageDigitModifiers(settings?.pageDigitModifiers),
    pageNextShortcut: normalizePageCycleShortcut(settings?.pageNextShortcut, DEFAULT_PAGE_NEXT_SHORTCUT),
    pagePreviousShortcut: normalizePageCycleShortcut(settings?.pagePreviousShortcut, DEFAULT_PAGE_PREVIOUS_SHORTCUT),
    // Module switches: anything but an explicit false keeps the module on.
    todoEnabled: settings?.todoEnabled !== false,
    musicEnabled: settings?.musicEnabled !== false,
    agentStatusEnabled: settings?.agentStatusEnabled !== false,
    agentTitleEnabled: settings?.agentTitleEnabled !== false,
    shelfEnabled: settings?.shelfEnabled !== false,
    translationEnabled: settings?.translationEnabled !== false,
    translationTarget: settings?.translationTarget === "island" ? "island" : "window",
    shelfExpandOnDrop: settings?.shelfExpandOnDrop !== false,
    shelfAutoCleanupDays: (SHELF_CLEANUP_DAYS as readonly unknown[]).includes(settings?.shelfAutoCleanupDays)
      ? (settings?.shelfAutoCleanupDays as number)
      : DEFAULT_SETTINGS.shelfAutoCleanupDays,
    shelfRemoveMissing: settings?.shelfRemoveMissing === true,
    shelfRemoveAfterDragOut: settings?.shelfRemoveAfterDragOut === true,
    shelfMaxItems: typeof settings?.shelfMaxItems === "number" && Number.isFinite(settings.shelfMaxItems)
      ? clamp(Math.round(settings.shelfMaxItems), MIN_SHELF_ITEMS, MAX_SHELF_ITEMS)
      : DEFAULT_SETTINGS.shelfMaxItems,
    shelfDoubleClick: settings?.shelfDoubleClick === "reveal" ? "reveal" : "open",
    shelfShowCount: settings?.shelfShowCount === true,
    deviceUseIndicator: settings?.deviceUseIndicator !== false,
    levelPopup: settings?.levelPopup !== false,
    mailEnabled: settings?.mailEnabled !== false,
    gameDoNotDisturb: settings?.gameDoNotDisturb !== false,
    gameAutoTuck: settings?.gameAutoTuck === true,
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
