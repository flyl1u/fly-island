import type { AgentProvider, AgentSessionSummary, ExternalAgentStatus } from "./api";
import { isSessionRunning, isSessionWaiting, sessionProject } from "./sessionList.ts";
import { AGENT_PROVIDER_LABELS } from "./status.ts";

export type AgentSession = {
  /** Null for a source reported by a plugin or the local API. */
  provider: AgentProvider | null;
  /** Who is working, e.g. "Claude Code" or a reported source's name. */
  label: string;
  title: string;
};

type Candidate = { session: AgentSession; updatedAt: number };

/**
 * Claude Code and Codex come from the session files (the Agent page's list), so the island
 * names them with or without the island's hooks; plugin and local API sources report their own
 * title in the status snapshot.
 */
function candidates(sessions: AgentSessionSummary[], others: ExternalAgentStatus[] | undefined): Candidate[] {
  const fromSessions = sessions.filter((summary) => isSessionRunning(summary) || isSessionWaiting(summary)).map((summary) => ({
    session: {
      provider: summary.provider,
      label: AGENT_PROVIDER_LABELS[summary.provider],
      title: (summary.title ?? sessionProject(summary.cwd) ?? "").trim(),
    },
    updatedAt: summary.updatedAt,
  }));
  const fromOthers = (others ?? []).filter((other) => other.phase === "running" || other.phase === "waiting").map((other) => ({
    session: { provider: null, label: other.name, title: (other.title ?? "").trim() },
    updatedAt: other.updatedAt,
  }));
  return [...fromSessions, ...fromOthers].filter((candidate) => candidate.session.title);
}

/** The newest running or waiting session with a title. */
export function pickAgentSession(
  sessions: AgentSessionSummary[],
  others: ExternalAgentStatus[] | undefined,
): AgentSession | null {
  let picked: Candidate | null = null;
  for (const candidate of candidates(sessions, others)) {
    if (!picked || candidate.updatedAt > picked.updatedAt) {
      picked = candidate;
    }
  }
  return picked?.session ?? null;
}
