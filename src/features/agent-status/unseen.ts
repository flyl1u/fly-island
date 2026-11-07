import type { AgentSessionSummary } from "./api";
import { sessionLight } from "./sessionLight.ts";

/**
 * Which turns the user has looked at: finished ones, and ones waiting on the user (an approval,
 * a question, a reply). A turn is told apart by when its prompt was sent (or, without one, when
 * the session file last changed), so the next turn of a session counts as unseen again while
 * later writes to a finished turn (titles, summaries) do not. A session stuck mid-turn is told
 * apart by its last write instead, so a second wait in the same turn is unseen again.
 */
export type SeenTurns = {
  /** Finished turns that ended before this (Unix ms, when the island started) count as seen. */
  since: number;
  /** `provider:sessionId` → the turn last seen. */
  seen: Record<string, number>;
};

export function sessionKey(session: Pick<AgentSessionSummary, "provider" | "sessionId">) {
  return `${session.provider}:${session.sessionId}`;
}

function turnOf(session: AgentSessionSummary) {
  return session.phase === "waiting" ? session.updatedAt : session.turnStartedAt ?? session.updatedAt;
}

/**
 * Whether the session waits on the user: stuck mid-turn on an approval or a question, a finished
 * turn that asked something, or a failed one. These are what the island keeps asking about until
 * the user has looked (roadmap B15).
 */
export function asksUser(session: AgentSessionSummary) {
  const light = sessionLight(session);
  return light === "needs" || light === "yourTurn" || light === "failed";
}

/**
 * A turn the user has not looked at yet: a finished or failed one, or one waiting on the user.
 * Something still asking does so even if it began before the island started; a finished turn
 * from before then counts as seen.
 */
export function isUnseen(session: AgentSessionSummary, turns: SeenTurns) {
  const ended = session.phase === "completed" || session.phase === "failed";
  if (!ended && session.phase !== "waiting") return false;
  const recent = asksUser(session) || session.updatedAt > turns.since;
  return recent && turns.seen[sessionKey(session)] !== turnOf(session);
}

/** `turns` with the current turn of each of `sessions` seen; the same object when nothing changed. */
export function markSeen(turns: SeenTurns, sessions: AgentSessionSummary[]): SeenTurns {
  const changed = sessions.filter((session) => turns.seen[sessionKey(session)] !== turnOf(session));
  if (changed.length === 0) return turns;
  return { ...turns, seen: { ...turns.seen, ...Object.fromEntries(changed.map((session) => [sessionKey(session), turnOf(session)])) } };
}
