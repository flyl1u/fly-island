import type { AgentSessionSummary } from "./api";
import { sessionKey } from "./unseen.ts";

/** What a session just did that the island pops up for. */
export type AgentAlertKind = "completed" | "failed" | "waiting";

export type AgentAlert = { kind: AgentAlertKind; session: AgentSessionSummary };

type Phase = AgentSessionSummary["phase"];

/** The phase each session was in at the last look, by `provider:sessionId`. */
export type SessionPhases = ReadonlyMap<string, Phase>;

export function phasesOf(sessions: AgentSessionSummary[]): SessionPhases {
  return new Map(sessions.map((session) => [sessionKey(session), session.phase]));
}

/**
 * The alert a change from `before` to `after` calls for. A session seen for the first time
 * (`before` undefined) only alerts when it is already waiting for the user: one that shows up
 * finished is an old session coming into the listed time window, not a turn that just ended.
 */
export function alertKind(before: Phase | undefined, after: Phase): AgentAlertKind | null {
  if (after === "waiting" && before !== "waiting") return "waiting";
  if (before === undefined) return null;
  if (after === "failed" && before !== "failed") return "failed";
  if (after === "completed" && (before === "running" || before === "waiting" || before === "stale")) return "completed";
  return null;
}

/**
 * Alerts for the sessions whose phase changed since `previous`, of the kinds switched on.
 * The first look (`previous` null) only takes note of where every session stands.
 */
export function detectAlerts(
  previous: SessionPhases | null,
  sessions: AgentSessionSummary[],
  kinds: Record<AgentAlertKind, boolean>,
): AgentAlert[] {
  if (!previous) return [];
  return sessions.flatMap((session) => {
    const kind = alertKind(previous.get(sessionKey(session)), session.phase);
    return kind && kinds[kind] ? [{ kind, session }] : [];
  });
}
