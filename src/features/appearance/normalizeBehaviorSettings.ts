// Reading saved settings, part 3 (normalizeSettings in settings.ts): behaviour and modules.
import { normalizeLyricsSettings } from "../media/lyrics/lyricsSettings.ts";
import { normalizeBatteryPreferences } from "../battery/preferences.ts";
import { DEFAULT_SETTINGS } from "./settingsDefaults.ts";
import { normalizeOrder } from "../../utils/order.ts";
import { AUTO_COLLAPSE_SECONDS, BROWSER_AUTO_TUCK_DELAY_SECONDS, TUCK_DELAY_SECONDS, TUCK_EDGE_HEIGHT, COLLAPSED_ITEMS, PAGE_DOTS, SHELF_CLEANUP_DAYS, oneOf } from "./settingsLimits.ts";
import type { IslandSettings, LegacyIslandSettings } from "./types";
import { normalizeCollapsedHidden, normalizeCollapsedLayout } from "./collapsedLayout.ts";
import { normalizeIdleText, normalizeTodoPendingDisplay } from "./idleText.ts";
import { TODO_ROTATION_SECONDS, TODO_SCROLL_SPEED, MESSAGE_PREVIEW_SECONDS, MESSAGE_EXPAND_MAX_WIDTH, MESSAGE_EXPAND_MAX_HEIGHT, MESSAGE_EXPAND_SECONDS, GAME_NOTICE_SECONDS } from "./settingsLimits.ts";

/** Todos, tucking and opening, module switches, the file shelf and lyrics. */
export function normalizeBehaviorSettings(settings: LegacyIslandSettings | null | undefined) {
  const autoTuck = typeof settings?.autoTuck === "boolean" ? settings.autoTuck : DEFAULT_SETTINGS.autoTuck;
  return {
    positionLocked: settings?.positionLocked === true,
    rotateTodos: settings?.rotateTodos === true,
    showIdleTodoCount: settings?.showIdleTodoCount !== false,
    idleText: normalizeIdleText(settings?.idleText),
    todoPendingDisplay: normalizeTodoPendingDisplay(settings?.todoPendingDisplay),
    todoRotationSeconds: wholeSeconds(settings?.todoRotationSeconds, TODO_ROTATION_SECONDS, TODO_ROTATION_SECONDS.default),
    todoRotationMode: oneOf(["switch", "scroll"] as const, settings?.todoRotationMode, "switch"),
    todoScrollSpeed: wholeSeconds(settings?.todoScrollSpeed, TODO_SCROLL_SPEED, TODO_SCROLL_SPEED.default),
    messagePreviewSeconds: wholeSeconds(settings?.messagePreviewSeconds, MESSAGE_PREVIEW_SECONDS, MESSAGE_PREVIEW_SECONDS.default),
    // v3.2.6 opt-ins, all off until chosen: adaptive previews, previews in game mode, timer reminders.
    messageAutoExpand: settings?.messageAutoExpand === true,
    messageExpandMaxWidth: wholeSeconds(settings?.messageExpandMaxWidth, MESSAGE_EXPAND_MAX_WIDTH, MESSAGE_EXPAND_MAX_WIDTH.default),
    messageExpandMaxHeight: wholeSeconds(settings?.messageExpandMaxHeight, MESSAGE_EXPAND_MAX_HEIGHT, MESSAGE_EXPAND_MAX_HEIGHT.default),
    messageExpandSeconds: wholeSeconds(settings?.messageExpandSeconds, MESSAGE_EXPAND_SECONDS, MESSAGE_EXPAND_SECONDS.default),
    gameShowNotices: settings?.gameShowNotices === true,
    gameNoticeSeconds: wholeSeconds(settings?.gameNoticeSeconds, GAME_NOTICE_SECONDS, GAME_NOTICE_SECONDS.default),
    todoTimerReminder: settings?.todoTimerReminder === true,
    todoTimerReminderSound: settings?.todoTimerReminderSound === true,
    carryOverIncompleteTodos:
      typeof settings?.carryOverIncompleteTodos === "boolean"
        ? settings.carryOverIncompleteTodos
        : DEFAULT_SETTINGS.carryOverIncompleteTodos,
    todoTimerEnabled: typeof settings?.todoTimerEnabled === "boolean"
      ? settings.todoTimerEnabled : DEFAULT_SETTINGS.todoTimerEnabled,
    // Unversioned false was written by the removed setting, rather than chosen by users.
    todoReorderVersion: 1,
    enableTodoReorder: settings?.todoReorderVersion === 1
      && typeof settings.enableTodoReorder === "boolean" ? settings.enableTodoReorder : true,
    autoTuck,
    neverAutoTuck: settings?.neverAutoTuck === true,
    browserAutoTuck: typeof settings?.browserAutoTuck === "boolean"
      ? settings.browserAutoTuck : DEFAULT_SETTINGS.browserAutoTuck,
    browserAutoTuckDelaySeconds: steppedSeconds(
      settings?.browserAutoTuckDelaySeconds,
      BROWSER_AUTO_TUCK_DELAY_SECONDS,
      BROWSER_AUTO_TUCK_DELAY_SECONDS.default,
    ),
    browserAutoTuckClickToOpen: settings?.browserAutoTuckClickToOpen === true,
    tuckStyle: oneOf(["edge", "line", "hidden"] as const, settings?.tuckStyle, DEFAULT_SETTINGS.tuckStyle),
    tuckEdgeHeight: wholeSeconds(settings?.tuckEdgeHeight, TUCK_EDGE_HEIGHT, TUCK_EDGE_HEIGHT.default),
    // Saved before this was a setting: an open panel closed only when the island tucked after
    // idling, so it keeps closing after that delay, or never with tucking off.
    autoCollapseSeconds: wholeSeconds(settings?.autoCollapseSeconds, AUTO_COLLAPSE_SECONDS, autoTuck ? AUTO_COLLAPSE_SECONDS.default : 0),
    tuckDelaySeconds: wholeSeconds(settings?.tuckDelaySeconds, TUCK_DELAY_SECONDS, TUCK_DELAY_SECONDS.default),
    // Game mode: on unless turned off. Tucking while full screen stays at its default (off).
    gameDoNotDisturb: settings?.gameDoNotDisturb !== false,
    // New in 3.2.6 and off unless switched on.
    ctrlWheelPages: settings?.ctrlWheelPages === true,
    expandTrigger: settings?.expandTrigger === "hover" ? "hover" : "click",
    // Module switches: anything but an explicit false keeps the module on.
    todoEnabled: settings?.todoEnabled !== false,
    ...normalizeBatteryPreferences(settings),
    musicEnabled: settings?.musicEnabled !== false,
    agentStatusEnabled: settings?.agentStatusEnabled !== false,
    agentTitleEnabled: settings?.agentTitleEnabled !== false,
    shelfEnabled: settings?.shelfEnabled !== false,
    translationEnabled: settings?.translationEnabled !== false,
    shelfAutoCleanupDays: oneOf(SHELF_CLEANUP_DAYS, settings?.shelfAutoCleanupDays, DEFAULT_SETTINGS.shelfAutoCleanupDays),
    ...normalizeLyricsSettings(settings),
    mailEnabled: settings?.mailEnabled !== false,
    autoCopyOtp: typeof settings?.autoCopyOtp === "boolean" ? settings.autoCopyOtp : DEFAULT_SETTINGS.autoCopyOtp,
    collapsedPriority: normalizeOrder(settings?.collapsedPriority, COLLAPSED_ITEMS),
    collapsedShowCover: settings?.collapsedShowCover !== false,
    collapsedLayout: normalizeCollapsedLayout(settings?.collapsedLayout),
    collapsedHidden: normalizeCollapsedHidden(settings?.collapsedHidden),
    pageOrder: normalizeOrder(settings?.pageOrder, PAGE_DOTS),
    // Selected activities pause automatic tucking only with an explicit boolean setting.
    keepVisibleWhileAgentRunning: typeof settings?.keepVisibleWhileAgentRunning === "boolean"
      ? settings.keepVisibleWhileAgentRunning : DEFAULT_SETTINGS.keepVisibleWhileAgentRunning,
    keepVisibleWhileLyrics: typeof settings?.keepVisibleWhileLyrics === "boolean"
      ? settings.keepVisibleWhileLyrics : DEFAULT_SETTINGS.keepVisibleWhileLyrics,
    keepVisibleWhileTodoRunning: typeof settings?.keepVisibleWhileTodoRunning === "boolean"
      ? settings.keepVisibleWhileTodoRunning : DEFAULT_SETTINGS.keepVisibleWhileTodoRunning,
  } satisfies Partial<IslandSettings>;
}

/** A typed-in number of seconds, rounded and kept within its range; anything else falls back. */
function wholeSeconds(value: unknown, range: { min: number; max: number }, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(range.max, Math.max(range.min, Math.round(value)));
}

/** A saved delay rounded to its setting step. */
function steppedSeconds(value: unknown, range: { min: number; max: number; step: number }, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const precision = String(range.step).split(".")[1]?.length ?? 0;
  const rounded = Number((Math.round(value / range.step) * range.step).toFixed(precision));
  return Math.min(range.max, Math.max(range.min, rounded));
}
