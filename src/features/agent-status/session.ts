import type { AgentProvider, AgentSessionSummary, ExternalAgentStatus } from "./api";
import { isSessionRunning, isSessionWaiting, sessionProject } from "./sessionList.ts";
import { sessionKey } from "./unseen.ts";
import { AGENT_PROVIDER_LABELS } from "./status.ts";

export type AgentSession = {
  /** Null for a source reported by a plugin or the local API. */
  provider: AgentProvider | null;
  /** Who is working, e.g. "Claude Code" or a reported source's name. */
  label: string;
  title: string;
};

type Candidate = { key: string; session: AgentSession; running: boolean; updatedAt: number; startedAt: number };

/** A session that is working now. `session` is null when it has nothing to be named by. */
export type RunningAgent = { key: string; session: AgentSession | null; startedAt: number };

/**
 * Claude Code and Codex come from the session files (the Agent page's list), so the island
 * names them with or without the island's hooks; plugin and local API sources report their own
 * title in the status snapshot.
 */
function candidates(sessions: AgentSessionSummary[], others: ExternalAgentStatus[] | undefined): Candidate[] {
  const fromSessions = sessions.filter((summary) => isSessionRunning(summary) || isSessionWaiting(summary)).map((summary) => ({
    key: sessionKey(summary),
    running: isSessionRunning(summary),
    startedAt: summary.turnStartedAt ?? summary.updatedAt,
    session: {
      provider: summary.provider,
      label: AGENT_PROVIDER_LABELS[summary.provider],
      title: (summary.title ?? sessionProject(summary.cwd) ?? "").trim(),
    },
    updatedAt: summary.updatedAt,
  }));
  const fromOthers = (others ?? []).filter((other) => other.phase === "running" || other.phase === "waiting").map((other) => ({
    key: `other:${other.id}`,
    running: other.phase === "running",
    startedAt: other.updatedAt,
    session: { provider: null, label: other.name, title: (other.title ?? "").trim() },
    updatedAt: other.updatedAt,
  }));
  return [...fromSessions, ...fromOthers];
}

/**
 * Every session working now (only `running` counts, not waiting or idle), so the island can tell
 * when one starts. Untitled ones are listed too: gaining a title is not a new task.
 */
export function listRunningAgents(sessions: AgentSessionSummary[], others: ExternalAgentStatus[] | undefined): RunningAgent[] {
  return candidates(sessions, others).filter((candidate) => candidate.running)
    .map(({ key, session, startedAt }) => ({ key, session: session.title ? session : null, startedAt }));
}

/** The newest running or waiting session with a title. */
export function pickAgentSession(
  sessions: AgentSessionSummary[],
  others: ExternalAgentStatus[] | undefined,
): AgentSession | null {
  let picked: Candidate | null = null;
  for (const candidate of candidates(sessions, others).filter((candidate) => candidate.session.title)) {
    if (!picked || candidate.updatedAt > picked.updatedAt) {
      picked = candidate;
    }
  }
  return picked?.session ?? null;
}
