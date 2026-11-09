import { readJson, writeJson } from "../../lib/storage.ts";
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

export const SEEN_TURNS_STORAGE_KEY = "focusd-island-agent-seen-turns";
/** Older entries are dropped past this many. */
export const MAX_SEEN = 300;

/**
 * The turns looked at, as saved, so a restart of the island does not ask again about sessions
 * already looked at (a session waiting on you counts as unseen whenever it began).
 */
export function normalizeSeen(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]),
  );
  return Object.fromEntries(entries.slice(-MAX_SEEN));
}

export function loadSeenTurns(): SeenTurns {
  return { since: Date.now(), seen: normalizeSeen(readJson(SEEN_TURNS_STORAGE_KEY)) };
}

export function saveSeen(seen: Record<string, number>) {
  writeJson(SEEN_TURNS_STORAGE_KEY, normalizeSeen(seen));
}

/** `turns` with the current turn of each of `sessions` seen; the same object when nothing changed. */
export function markSeen(turns: SeenTurns, sessions: AgentSessionSummary[]): SeenTurns {
  const changed = sessions.filter((session) => turns.seen[sessionKey(session)] !== turnOf(session));
  if (changed.length === 0) return turns;
  // Re-added at the end, so the newest stay when the oldest are dropped.
  const keys = new Set(changed.map(sessionKey));
  const kept = Object.entries(turns.seen).filter(([key]) => !keys.has(key));
  const added = changed.map((session) => [sessionKey(session), turnOf(session)] as const);
  return { ...turns, seen: Object.fromEntries([...kept, ...added].slice(-MAX_SEEN)) };
}
