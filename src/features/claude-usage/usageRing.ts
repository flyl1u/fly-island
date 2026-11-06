import type { AgentUsage, UsageWindow } from "../agent-status/api";
import { untilReset } from "../agent-status/usage.ts";
import type { HoverCardLine } from "../../components/IslandHoverCard";
import type { MiniRingTrack } from "../../components/MiniRing";
import type { ClaudeUsageText } from "../../i18n/sections/claudeUsage";

/** Ring size plus the gauge slot's gap, for the collapsed width (CollapsedSlots.sideWidth). */
export const CLAUDE_USAGE_GAUGE_WIDTH = 20 + 6;

/** Older numbers turn the ring grey (the Agent page's usage line uses the same age). */
export const USAGE_STALE_MS = 15 * 60_000;

export const USAGE_COLORS = {
  normal: "#E5A385",
  warn: "#E5C890",
  danger: "#E78284",
  stale: "#8E8E93",
} as const;

/**
 * Grey when there is no snapshot or it is over 15 minutes old. A snapshot without a write time
 * counts as current, as on the Agent page.
 */
export function isUsageStale(usage: AgentUsage | null, now: number) {
  return usage === null || (usage.updatedAt !== null && now - usage.updatedAt > USAGE_STALE_MS);
}

export function usageColor(percent: number, stale: boolean) {
  if (stale) return USAGE_COLORS.stale;
  if (percent >= 90) return USAGE_COLORS.danger;
  if (percent >= 70) return USAGE_COLORS.warn;
  return USAGE_COLORS.normal;
}

/** Outer ring 5 hours, inner 7 days; a missing window is a bare track. */
export function usageRings(usage: AgentUsage | null, now: number): MiniRingTrack[] {
  const stale = isUsageStale(usage, now);
  return [usage?.fiveHour ?? null, usage?.sevenDay ?? null].map((limit) =>
    limit ? { value: limit.used / 100, color: usageColor(limit.used, stale) } : { value: 0, color: USAGE_COLORS.stale },
  );
}

function resetText(limit: UsageWindow, now: number, text: ClaudeUsageText) {
  if (limit.resetsAt === null) return null;
  const parts = untilReset(limit.resetsAt, now);
  return parts ? text.resetsIn(parts) : text.resettingSoon;
}

/**
 * The hover card: each window with its ring colour, why asking Anthropic failed (the numbers stay
 * coloured while fresh), then how old the numbers are and where they come from.
 */
export function usageCardLines(usage: AgentUsage | null, now: number, text: ClaudeUsageText): HoverCardLine[] {
  if (!usage) return [{ text: text.noData, muted: true }];
  const stale = isUsageStale(usage, now);
  const lines: HoverCardLine[] = [];
  for (const [label, limit] of [
    [text.fiveHour, usage.fiveHour],
    [text.sevenDay, usage.sevenDay],
  ] as const) {
    if (limit) {
      const percent = Math.round(limit.used);
      lines.push({ text: text.window(label, percent, resetText(limit, now, text)), color: usageColor(limit.used, stale) });
    }
  }
  const hasNumbers = lines.length > 0;
  if (!hasNumbers) lines.push({ text: text.noData, muted: true });
  if (usage.error) lines.push({ text: text.errors[usage.error.kind] });
  if (usage.updatedAt !== null && hasNumbers) {
    const minutes = Math.max(0, Math.floor((now - usage.updatedAt) / 60_000));
    lines.push({ text: text.updated(text.updatedAgo(minutes), usage.source === "api" ? text.fromApi : usage.source === "magpie" ? text.fromMagpie : text.fromHud), muted: true });
  }
  return lines;
}
