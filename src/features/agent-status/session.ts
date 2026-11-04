import type { AgentProvider, AgentSessionSummary, AgentTaskStatus, ExternalAgentStatus } from "./api";
import { sessionProject } from "./sessionList.ts";
import { AGENT_PROVIDER_LABELS } from "./status.ts";

/** How long a finished session's title stays on the island before the todo comes back. */
export const COMPLETED_TITLE_HOLD_MS = 3000;

export type AgentSession = {
  /** Null for a source reported by a plugin or the local API. */
  provider: AgentProvider | null;
  /** Who is working, e.g. "Claude Code" or a reported source's name. */
  label: string;
  title: string;
};

type Candidate = { session: AgentSession; phase: AgentTaskStatus["phase"]; updatedAt: number };

/**
 * Claude Code and Codex come from the session files (the Agent page's list), so the island
 * names them with or without FocuSD's hooks; plugin and local API sources report their own
 * title in the status snapshot.
 */
function candidates(sessions: AgentSessionSummary[], others: ExternalAgentStatus[] | undefined): Candidate[] {
  const fromSessions = sessions.map((summary) => ({
    session: {
      provider: summary.provider,
      label: AGENT_PROVIDER_LABELS[summary.provider],
      title: (summary.title ?? sessionProject(summary.cwd) ?? "").trim(),
    },
    phase: summary.phase,
    updatedAt: summary.updatedAt,
  }));
  const fromOthers = (others ?? []).map((other) => ({
    session: { provider: null, label: other.name, title: (other.title ?? "").trim() },
    phase: other.phase,
    updatedAt: other.updatedAt,
  }));
  return [...fromSessions, ...fromOthers].filter((candidate) => candidate.session.title);
}

function isVisible({ phase, updatedAt }: Candidate, now: number) {
  return (
    phase === "running" ||
    phase === "failed" ||
    phase === "stale" ||
    (phase === "completed" && now - updatedAt < COMPLETED_TITLE_HOLD_MS)
  );
}

/**
 * The session the collapsed island should name: a running, failed or stale one, or one that
 * completed less than `COMPLETED_TITLE_HOLD_MS` ago. With several, the most recently updated
 * wins.
 */
export function pickAgentSession(
  sessions: AgentSessionSummary[],
  others: ExternalAgentStatus[] | undefined,
  now: number,
): AgentSession | null {
  let picked: Candidate | null = null;
  for (const candidate of candidates(sessions, others)) {
    if (isVisible(candidate, now) && (!picked || candidate.updatedAt > picked.updatedAt)) {
      picked = candidate;
    }
  }
  return picked?.session ?? null;
}

/** When the next completed title stops being shown, or null when nothing expires. */
export function agentSessionExpiresAt(
  sessions: AgentSessionSummary[],
  others: ExternalAgentStatus[] | undefined,
  now: number,
): number | null {
  const expiries = candidates(sessions, others)
    .filter((candidate) => candidate.phase === "completed")
    .map((candidate) => candidate.updatedAt + COMPLETED_TITLE_HOLD_MS)
    .filter((expiresAt) => expiresAt > now);
  return expiries.length > 0 ? Math.min(...expiries) : null;
}
