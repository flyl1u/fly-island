import type { AgentProvider, AgentStatusSnapshot } from "./api";
import { listAgentStatuses } from "./status.ts";

/** How long a finished session's title stays on the island before the todo comes back. */
export const COMPLETED_TITLE_HOLD_MS = 3000;

export type AgentSession = {
  /** Null for a source reported by a plugin or the local API. */
  provider: AgentProvider | null;
  /** Who is working, e.g. "Claude Code" or a reported source's name. */
  label: string;
  title: string;
};

/**
 * The session the collapsed island should name: a running, failed or stale one, or one that
 * completed less than `COMPLETED_TITLE_HOLD_MS` ago. With several, the most recently updated wins.
 */
export function pickAgentSession(snapshot: AgentStatusSnapshot, now: number): AgentSession | null {
  let picked: { session: AgentSession; updatedAt: number } | null = null;
  for (const { provider, label, status } of listAgentStatuses(snapshot)) {
    const title = status.title?.trim();
    if (!title) continue;
    const visible =
      status.phase === "running" ||
      status.phase === "failed" ||
      status.phase === "stale" ||
      (status.phase === "completed" && now - status.updatedAt < COMPLETED_TITLE_HOLD_MS);
    if (visible && (!picked || status.updatedAt > picked.updatedAt)) {
      picked = { session: { provider, label, title }, updatedAt: status.updatedAt };
    }
  }
  return picked?.session ?? null;
}

/** When the picked completed session stops being shown, or null when nothing expires. */
export function agentSessionExpiresAt(snapshot: AgentStatusSnapshot, now: number): number | null {
  const expiries = listAgentStatuses(snapshot)
    .map((entry) => entry.status)
    .filter((status) => status.phase === "completed" && status.title?.trim())
    .map((status) => status.updatedAt + COMPLETED_TITLE_HOLD_MS)
    .filter((expiresAt) => expiresAt > now);
  return expiries.length > 0 ? Math.min(...expiries) : null;
}
