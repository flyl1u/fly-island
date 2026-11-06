import type { AgentSessionSummary } from "./api";
import type { AgentAlertStarted, IslandSettings } from "../appearance/types";
import { sessionKey } from "./unseen.ts";

/** What a session just did that the island pops up for. */
export type AgentAlertKind = "started" | "completed" | "failed" | "waiting";

export type AgentAlert = { kind: AgentAlertKind; session: AgentSessionSummary };

/** Which alerts are on: a switch for each kind, and for starts, which ones. */
export type AgentAlertKinds = Record<Exclude<AgentAlertKind, "started">, boolean> & { started: AgentAlertStarted };

type Phase = AgentSessionSummary["phase"];

/**
 * The phase each session was in at the last look, by `provider:sessionId`, and the sessions seen
 * working since the island started watching (all of them at the first look), which tells a new
 * session's first turn from a later one.
 */
export type SessionPhases = { phases: ReadonlyMap<string, Phase>; worked: ReadonlySet<string> };

const isWorking = (phase: Phase) => phase === "running" || phase === "waiting" || phase === "stale";

export function phasesOf(sessions: AgentSessionSummary[], previous: SessionPhases | null = null): SessionPhases {
  const worked = new Set(previous?.worked);
  for (const session of sessions) {
    if (!previous || isWorking(session.phase)) worked.add(sessionKey(session));
  }
  return { phases: new Map(sessions.map((session) => [sessionKey(session), session.phase])), worked };
}

export function alertKindsOf(settings: Pick<IslandSettings, "agentAlertStarted" | "agentAlertCompleted" | "agentAlertFailed" | "agentAlertWaiting">): AgentAlertKinds {
  return { started: settings.agentAlertStarted, completed: settings.agentAlertCompleted, failed: settings.agentAlertFailed, waiting: settings.agentAlertWaiting };
}

/**
 * The alert a change from `before` to `after` calls for. A session seen for the first time
 * (`before` undefined) alerts when it is already waiting for the user or working (it just
 * started); one that shows up finished is an old session coming into the listed time window,
 * not a turn that just ended. A turn starts when a finished session runs again; a stalled one
 * running again, or a waiting one answered, carries on the same turn.
 */
export function alertKind(before: Phase | undefined, after: Phase): AgentAlertKind | null {
  if (after === "waiting" && before !== "waiting") return "waiting";
  if (after === "running" && (before === undefined || before === "completed" || before === "failed")) return "started";
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
  kinds: AgentAlertKinds,
): AgentAlert[] {
  if (!previous) return [];
  return sessions.flatMap((session) => {
    const key = sessionKey(session);
    const kind = alertKind(previous.phases.get(key), session.phase);
    if (!kind) return [];
    const on = kind === "started"
      ? kinds.started === "everyTurn" || (kinds.started === "newSession" && !previous.worked.has(key))
      : kinds[kind];
    return on ? [{ kind, session }] : [];
  });
}
