import type { AgentSessionSummary } from "./api";

/**
 * Which finished turns the user has looked at. A turn is told apart by when its prompt was sent
 * (or, without one, when the session file last changed), so the next turn of a session counts as
 * unseen again while later writes to a finished turn (titles, summaries) do not.
 */
export type SeenTurns = {
  /** Turns that finished before this (Unix ms, when the island started) count as seen. */
  since: number;
  /** `provider:sessionId` → the turn last seen. */
  seen: Record<string, number>;
};

export function sessionKey(session: Pick<AgentSessionSummary, "provider" | "sessionId">) {
  return `${session.provider}:${session.sessionId}`;
}

function turnOf(session: AgentSessionSummary) {
  return session.turnStartedAt ?? session.updatedAt;
}

/** A finished or failed turn the user has not looked at yet. */
export function isUnseen(session: AgentSessionSummary, turns: SeenTurns) {
  return (
    (session.phase === "completed" || session.phase === "failed") &&
    session.updatedAt > turns.since &&
    turns.seen[sessionKey(session)] !== turnOf(session)
  );
}

/** `turns` with the current turn of each of `sessions` seen; the same object when nothing changed. */
export function markSeen(turns: SeenTurns, sessions: AgentSessionSummary[]): SeenTurns {
  const changed = sessions.filter((session) => turns.seen[sessionKey(session)] !== turnOf(session));
  if (changed.length === 0) return turns;
  return { ...turns, seen: { ...turns.seen, ...Object.fromEntries(changed.map((session) => [sessionKey(session), turnOf(session)])) } };
}
