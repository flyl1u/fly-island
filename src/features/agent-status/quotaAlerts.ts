// When an agent's usage limits or balance call for a pop-up (roadmap B6.5.2). Pure.
import type { AgentUsage } from "./api";
import { isStale, type AgentUsages } from "./usage.ts";

export type QuotaAgent = "claude" | "codex" | "dsh" | "workbuddy";
export type QuotaWindow = "fiveHour" | "sevenDay" | "balance";

/** Usage reached the alert level (`low`), or a limit that had reached it reset (`reset`). */
export type QuotaAlert = { kind: "low" | "reset"; agent: QuotaAgent; window: QuotaWindow; used: number; resetsAt: number | null };

/** Limits read so far, and those that reached the alert level and have not reset since, by `agent:window`. */
export type QuotaState = { seen: Set<string>; reached: Set<string> };

export function emptyQuotaState(): QuotaState {
  return { seen: new Set(), reached: new Set() };
}

/**
 * A limit counts as reset when its use falls this many points below the alert level: rolling
 * windows ease off a little at a time, and that is no reset.
 */
const RESET_DROP = 30;

const WINDOWS = ["fiveHour", "sevenDay"] as const;

/**
 * The alerts for usage as just read, against `percent` (0: off), updating `state`. A limit at or
 * above the level when first seen (the island just started) is noted without an alert, so a
 * restart does not repeat it, and alerts when it resets. Stale or missing snapshots change nothing.
 */
export function takeQuotaAlerts(state: QuotaState, usages: AgentUsages, percent: number, now: number): QuotaAlert[] {
  if (percent <= 0) return [];
  const alerts: QuotaAlert[] = [];
  const read: [QuotaAgent, AgentUsage | null][] = [["claude", usages.claude], ["codex", usages.codex]];
  for (const [agent, usage] of read) {
    if (!usage || isStale(usage, now)) continue;
    for (const window of WINDOWS) {
      const limit = usage[window];
      if (!limit) continue;
      const key = `${agent}:${window}`;
      const base = { agent, window, used: limit.used, resetsAt: limit.resetsAt };
      const firstLook = !state.seen.has(key);
      state.seen.add(key);
      if (!state.reached.has(key) && limit.used >= percent) {
        state.reached.add(key);
        if (!firstLook) alerts.push({ kind: "low", ...base });
      } else if (state.reached.has(key) && limit.used <= Math.max(0, percent - RESET_DROP)) {
        state.reached.delete(key);
        alerts.push({ kind: "reset", ...base });
      }
    }
  }
  // Prepaid balances have no limit to measure against; only running out and coming back alert.
  const balances: [QuotaAgent, boolean | null][] = [
    ["dsh", usages.dsh && !isStale(usages.dsh, now) ? !usages.dsh.available : null],
    ["workbuddy", usages.workbuddy && !isStale(usages.workbuddy, now) ? usages.workbuddy.remaining <= 0 : null],
  ];
  for (const [agent, empty] of balances) {
    if (empty === null) continue;
    const key = `${agent}:balance`;
    const firstLook = !state.seen.has(key);
    state.seen.add(key);
    const wasEmpty = state.reached.has(key);
    if (empty) state.reached.add(key);
    else state.reached.delete(key);
    if (!firstLook && wasEmpty !== empty) {
      alerts.push({ kind: empty ? "low" : "reset", agent, window: "balance", used: empty ? 100 : 0, resetsAt: null });
    }
  }
  return alerts;
}
