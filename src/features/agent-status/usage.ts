import type { AgentUsage, UsageWindow } from "./api";

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
