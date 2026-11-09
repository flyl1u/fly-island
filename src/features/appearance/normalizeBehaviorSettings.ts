// Reading saved settings, part 3 (normalizeSettings in settings.ts): behaviour and modules.
import { clamp } from "../../utils/number.ts";
import { normalizeLyricsSettings } from "../media/lyrics/lyricsSettings.ts";
import { DEFAULT_SETTINGS, LEGACY_FALLBACKS } from "./settingsDefaults.ts";
import {
  MAX_AUTO_TUCK_RETRACT_DELAY_MS, MAX_HOVER_COLLAPSE_DELAY_MS, MAX_HOVER_EXPAND_DELAY_MS, MAX_SHELF_ITEMS,
  MIN_AUTO_TUCK_RETRACT_DELAY_MS, MIN_HOVER_COLLAPSE_DELAY_MS, MIN_HOVER_EXPAND_DELAY_MS, MIN_SHELF_ITEMS,
  SHELF_CLEANUP_DAYS, oneOf,
} from "./settingsLimits.ts";
import type { IslandSettings, LegacyIslandSettings } from "./types";

/** Todos, tucking and hovering, page shortcuts, module switches, the file shelf, lyrics, game mode. */
export function normalizeBehaviorSettings(settings: LegacyIslandSettings | null | undefined) {
  return {
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
    // Module switches: anything but an explicit false keeps the module on.
    todoEnabled: settings?.todoEnabled !== false,
    musicEnabled: settings?.musicEnabled !== false,
    agentStatusEnabled: settings?.agentStatusEnabled !== false,
    agentTitleEnabled: settings?.agentTitleEnabled !== false,
    shelfEnabled: settings?.shelfEnabled !== false,
    translationEnabled: settings?.translationEnabled !== false,
    translationTarget: settings?.translationTarget === "island" ? "island" : "window",
    shelfExpandOnDrop: settings?.shelfExpandOnDrop !== false,
    shelfAutoCleanupDays: oneOf(SHELF_CLEANUP_DAYS, settings?.shelfAutoCleanupDays, DEFAULT_SETTINGS.shelfAutoCleanupDays),
    shelfRemoveMissing: settings?.shelfRemoveMissing === true,
    shelfRemoveAfterDragOut: settings?.shelfRemoveAfterDragOut === true,
    shelfMaxItems: typeof settings?.shelfMaxItems === "number" && Number.isFinite(settings.shelfMaxItems)
      ? clamp(Math.round(settings.shelfMaxItems), MIN_SHELF_ITEMS, MAX_SHELF_ITEMS)
      : DEFAULT_SETTINGS.shelfMaxItems,
    shelfDoubleClick: settings?.shelfDoubleClick === "reveal" ? "reveal" : "open",
    shelfShowCount: settings?.shelfShowCount === true,
    ...normalizeLyricsSettings(settings),
    mailEnabled: settings?.mailEnabled !== false,
    gameDoNotDisturb: settings?.gameDoNotDisturb !== false,
    gameAutoTuck: settings?.gameAutoTuck === true,
  } satisfies Partial<IslandSettings>;
}
