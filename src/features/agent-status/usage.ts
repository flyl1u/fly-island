import type { AgentUsage, DshProblem, DshUsage, UsageWindow, WorkbuddyUsage } from "./api";
import type { AgentQuotaSource } from "../appearance/types";
import type { HoverCardLine } from "../../components/IslandHoverCard";
import type { Translations } from "../../i18n/types";

/**
 * A snapshot older than this no longer reads as current. The Claude desktop app samples about
 * every 15 minutes while it is open, so a shorter time would dim its numbers between samples.
 */
export const USAGE_STALE_MS = 45 * 60_000;

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

export function isStale(usage: Pick<AgentUsage, "updatedAt">, now: number) {
  return usage.updatedAt !== null && now - usage.updatedAt > USAGE_STALE_MS;
}

/** Where the numbers come from and how old they are: the Agent page's usage line card. */
export function usageSourceLines(usage: AgentUsage, now: number, text: Translations["agent"]["usage"]): HoverCardLine[] {
  const lines: HoverCardLine[] = [];
  if (usage.updatedAt !== null) {
    const minutes = Math.max(0, Math.floor((now - usage.updatedAt) / 60_000));
    const source = { magpie: text.fromMagpie, codex: text.fromCodex, hud: text.fromHud, claudeDesktop: text.fromClaudeDesktop }[usage.source ?? "hud"];
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
export type AgentUsages = {
  claude: AgentUsage | null;
  codex: AgentUsage | null;
  dsh?: DshUsage | null;
  /** Why DSH shows no balance though it is set up; shown in place of its ring. */
  dshProblem?: DshProblem | null;
  workbuddy?: WorkbuddyUsage | null;
  readAt: number;
};

export const EMPTY_USAGES: AgentUsages = { claude: null, codex: null, dsh: null, readAt: 0 };

export function filterQuotaUsages(usages: AgentUsages, sources: readonly AgentQuotaSource[]): AgentUsages {
  return {
    claude: sources.includes("claudeCode") ? usages.claude : null,
    codex: sources.includes("codex") ? usages.codex : null,
    dsh: sources.includes("dsh") ? usages.dsh : null,
    dshProblem: sources.includes("dsh") ? usages.dshProblem : null,
    workbuddy: sources.includes("workbuddy") ? usages.workbuddy : null,
    readAt: usages.readAt,
  };
}

/** Has a window to show. */
export function hasUsageNumbers(usage: AgentUsage | null): boolean {
  return Boolean(usage && (usage.fiveHour || usage.sevenDay || usage.models.length > 0));
}

/**
 * The windows an agent's quota rings show: the 5-hour one outside, the 7-day one inside. A plan
 * with neither but one long window (Codex Free's 30 days, listed by its length as "30d") shows
 * that one inside. Per-model windows (Claude's) only appear in the ring's card. Null: no rings.
 */
export function quotaRings(usage: AgentUsage | null): { outer: UsageWindow | null; inner: UsageWindow | null } | null {
  if (!usage) return null;
  const outer = usage.fiveHour;
  const inner = usage.sevenDay ?? (outer ? null : usage.models.find((window) => /^\d+d$/.test(window.name)) ?? null);
  return outer || inner ? { outer, inner } : null;
}

/** The Agent page reserves one row when at least one selected source has data. */
export function usageLineCount(usages: AgentUsages): number {
  return quotaRings(usages.claude) || quotaRings(usages.codex) || usages.dsh?.wallets.length || usages.dshProblem || usages.workbuddy ? 1 : 0;
}

type UsageText = Translations["agent"]["usage"];

/** Percent of a window still left, as Codex shows it ("93% left"), whole. */
export function percentLeft(window: UsageWindow) {
  return Math.round(100 - window.used);
}

/** One window as the rings' card and screen readers give it: "5 小时 剩余 96%（已用 4%）· 2 小时 49 分后重置". */
export function windowSummary(label: string, window: UsageWindow, now: number, text: UsageText) {
  const reset = untilReset(window.resetsAt, now);
  return [text.left(label, percentLeft(window), Math.round(window.used)), reset && text.resetsIn(reset)].filter(Boolean).join(" · ");
}

/** The label of a window: 5 hours, 7 days, or its own name ("30d", a model). */
export function windowLabel(usage: AgentUsage, window: UsageWindow, text: UsageText) {
  return window === usage.fiveHour ? text.fiveHour : window === usage.sevenDay ? text.sevenDay : window.name;
}

/** Every window of an agent, rings first, as the lines of its card. */
export function quotaSummaries(usage: AgentUsage, now: number, text: UsageText) {
  const windows = [usage.fiveHour, usage.sevenDay, ...usage.models].filter((window): window is UsageWindow => window !== null);
  return windows.map((window) => windowSummary(windowLabel(usage, window, text), window, now, text));
}
