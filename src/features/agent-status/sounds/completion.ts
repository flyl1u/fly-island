import type { AgentSessionSummary } from "../api";
import { sessionKey } from "../unseen.ts";

/**
 * How long a finished turn has to stay finished before it sounds. An agent that carries on by
 * itself (a background task's result, a queued prompt) runs again within moments: that was a
 * step of the task, not its end.
 */
export const COMPLETE_SETTLE_MS = 6_000;

type Turn = Pick<AgentSessionSummary, "provider" | "sessionId" | "phase" | "turnStartedAt">;

/**
 * The `pending` finished turns that may sound now: still finished in `current`, and not one whose
 * user prompt (`turnStartedAt`) already had its completion sound. A turn the agent continued on
 * its own keeps that prompt, so its later stops stay quiet. Marks the returned turns in `sounded`.
 */
export function settledCompletions<T extends Turn>(pending: T[], current: Turn[], sounded: Map<string, number>): T[] {
  const now = new Map(current.map((session) => [sessionKey(session), session]));
  return pending.filter((session) => {
    const key = sessionKey(session);
    const latest = now.get(key);
    if (latest?.phase !== "completed") return false;
    const prompt = latest.turnStartedAt ?? session.turnStartedAt;
    if (prompt !== null && sounded.get(key) === prompt) return false;
    if (prompt !== null) sounded.set(key, prompt);
    return true;
  });
}
