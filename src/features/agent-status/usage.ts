import type { AgentUsage, UsageWindow } from "./api";
import type { HoverCardLine } from "../../components/IslandHoverCard";
import type { Translations } from "../../i18n/types";

/** A snapshot older than this no longer reads as current. */
export const USAGE_STALE_MS = 15 * 60_000;

export type UsageLevel = "low" | "medium" | "high";

/** How close a window is to its limit, for its colour. */
export function usageLevel(used: number): UsageLevel {
  return used >= 85 ? "high" : used >= 50 ? "medium" : "low";
}

/** Whole days, hours and minutes until `resetsAt`; null when unknown or already past. */
export function untilReset(resetsAt: number | null, now: number) {
  if (resetsAt === null || resetsAt <= now) return null;
  const minutes = Math.ceil((resetsAt - now) / 60_000);
  return { days: Math.floor(minutes / 1440), hours: Math.floor((minutes % 1440) / 60), minutes: minutes % 60 };
}

/** The window to give a reset time for: the fullest one, as that is the one that will stop work. */
export function tightestWindow(usage: AgentUsage): UsageWindow | null {
  const windows = [usage.fiveHour, usage.sevenDay, ...usage.models].filter((window): window is UsageWindow => window !== null);
  return windows.reduce<UsageWindow | null>((tightest, window) => (tightest === null || window.used > tightest.used ? window : tightest), null);
}

export function isStale(usage: AgentUsage, now: number) {
  return usage.updatedAt !== null && now - usage.updatedAt > USAGE_STALE_MS;
}

/** Where the numbers come from and how old they are: the Agent page's usage line card. */
export function usageSourceLines(usage: AgentUsage, now: number, text: Translations["agent"]["usage"]): HoverCardLine[] {
  const lines: HoverCardLine[] = [];
  if (usage.updatedAt !== null) {
    const minutes = Math.max(0, Math.floor((now - usage.updatedAt) / 60_000));
    const source = { magpie: text.fromMagpie, codex: text.fromCodex, hud: text.fromHud }[usage.source ?? "hud"];
    lines.push({ text: text.updated(text.updatedAgo(minutes), source), muted: true });
  }
  return lines;
}

/**
 * `usage` without the windows whose reset time has passed: the snapshot still carries the
 * figure from before the reset (Codex writes a new one only when it is used again), and that
 * figure is no longer true. Usage elsewhere (another computer, the web) may have started the new
 * window, so its figure is unknown rather than 0: nothing is shown for it.
 */
export function withoutPastWindows(usage: AgentUsage | null, now: number): AgentUsage | null {
  if (!usage) return null;
  const live = (window: UsageWindow | null) => (window && window.resetsAt !== null && window.resetsAt <= now ? null : window);
  const models = usage.models.filter((window) => live(window));
  const fiveHour = live(usage.fiveHour);
  const sevenDay = live(usage.sevenDay);
  if (fiveHour === usage.fiveHour && sevenDay === usage.sevenDay && models.length === usage.models.length) return usage;
  return { ...usage, fiveHour, sevenDay, models };
}

/** Claude's and Codex's usage as last read, and when (for staleness and countdowns). */
export type AgentUsages = { claude: AgentUsage | null; codex: AgentUsage | null; readAt: number };

export const EMPTY_USAGES: AgentUsages = { claude: null, codex: null, readAt: 0 };

/** Has a window to show. */
export function hasUsageNumbers(usage: AgentUsage | null): boolean {
  return Boolean(usage && (usage.fiveHour || usage.sevenDay || usage.models.length > 0));
}

/** How many usage lines the Agent page shows, for its height. */
export function usageLineCount(usages: AgentUsages): number {
  return Number(hasUsageNumbers(usages.claude)) + Number(hasUsageNumbers(usages.codex));
}
