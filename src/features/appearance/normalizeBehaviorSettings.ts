// Reading saved settings, part 3 (normalizeSettings in settings.ts): behaviour and modules.
import { normalizeLyricsSettings } from "../media/lyrics/lyricsSettings.ts";
import { DEFAULT_SETTINGS } from "./settingsDefaults.ts";
import { normalizeOrder } from "../../utils/order.ts";
import { COLLAPSED_ITEMS, PAGE_DOTS, SHELF_CLEANUP_DAYS, oneOf } from "./settingsLimits.ts";
import type { IslandSettings, LegacyIslandSettings } from "./types";

/** Todos, tucking and opening, module switches, the file shelf and lyrics. */
export function normalizeBehaviorSettings(settings: LegacyIslandSettings | null | undefined) {
  return {
    carryOverIncompleteTodos:
      typeof settings?.carryOverIncompleteTodos === "boolean"
        ? settings.carryOverIncompleteTodos
        : DEFAULT_SETTINGS.carryOverIncompleteTodos,
    autoTuck: settings?.autoTuck === true,
    expandTrigger: settings?.expandTrigger === "hover" ? "hover" : "click",
    // Module switches: anything but an explicit false keeps the module on.
    todoEnabled: settings?.todoEnabled !== false,
    musicEnabled: settings?.musicEnabled !== false,
    agentStatusEnabled: settings?.agentStatusEnabled !== false,
    agentTitleEnabled: settings?.agentTitleEnabled !== false,
    shelfEnabled: settings?.shelfEnabled !== false,
    translationEnabled: settings?.translationEnabled !== false,
    shelfAutoCleanupDays: oneOf(SHELF_CLEANUP_DAYS, settings?.shelfAutoCleanupDays, DEFAULT_SETTINGS.shelfAutoCleanupDays),
    ...normalizeLyricsSettings(settings),
    mailEnabled: settings?.mailEnabled !== false,
    collapsedPriority: normalizeOrder(settings?.collapsedPriority, COLLAPSED_ITEMS),
    collapsedShowCover: settings?.collapsedShowCover === true,
    pageOrder: normalizeOrder(settings?.pageOrder, PAGE_DOTS),
  } satisfies Partial<IslandSettings>;
}
