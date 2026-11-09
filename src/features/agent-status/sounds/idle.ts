import type { AgentSessionSummary } from "../api";
import { sessionKey } from "../unseen.ts";

/** How long a finished session sits unread before the "waiting for you" sound. */
export const IDLE_SOUND_MS = 5 * 60_000;

/**
 * Finished sessions the user has not looked at, by `provider:sessionId`: since when they waited
 * (`since`), and which turns already had their sound (`played`, by `updatedAt`).
 */
export type IdleSessions = { since: Map<string, number>; played: Map<string, number> };

export function emptyIdleSessions(): IdleSessions {
  return { since: new Map(), played: new Map() };
}

/**
 * The sessions due the idle sound: finished, still unread (`unseen`) for `delayMs` or more, once
 * per turn. Updates `state`; a session that is read, works again or is gone starts over.
 */
export function takeIdleSessions(
  state: IdleSessions,
  sessions: AgentSessionSummary[],
  unseen: ReadonlySet<string>,
  now: number,
  delayMs = IDLE_SOUND_MS,
): AgentSessionSummary[] {
  const due: AgentSessionSummary[] = [];
  const present = new Set<string>();
  for (const session of sessions) {
    const key = sessionKey(session);
    if (session.phase !== "completed" || !unseen.has(key)) continue;
    present.add(key);
    const since = state.since.get(key) ?? now;
    state.since.set(key, since);
    if (now - since >= delayMs && state.played.get(key) !== session.updatedAt) {
      state.played.set(key, session.updatedAt);
      due.push(session);
    }
  }
  for (const key of state.since.keys()) {
    if (!present.has(key)) {
      state.since.delete(key);
      state.played.delete(key);
    }
  }
  return due;
}

/** Whether a session just began compacting its context (Claude Code's PreCompact hook). */
export function compactStarted(wasCompacting: boolean | undefined, session: Pick<AgentSessionSummary, "compacting">): boolean {
  return wasCompacting === false && session.compacting === true;
}
