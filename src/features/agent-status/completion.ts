import type { AgentSessionSummary } from "./api";

/** A first sighting is only a completion event inside this small freshness window. */
export const RECENT_COMPLETION_MS = 15_000;

type Completed = Pick<AgentSessionSummary, "phase" | "lastCompletedAt">;

/** Explicit turn ends also catch a whole turn between polls; file mtime can change for metadata. */
export function hasNewCompletion(before: number | null | undefined, session: Completed, now = Date.now()) {
  const ended = session.lastCompletedAt;
  if (session.phase !== "completed" || ended == null || !Number.isFinite(ended) || ended <= 0 || ended > now) return false;
  return before == null ? now - ended <= RECENT_COMPLETION_MS : ended > before;
}
