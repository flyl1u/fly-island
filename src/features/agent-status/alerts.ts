import type { AgentSessionSummary, ReplyMarker } from "./api";
import type { AgentAlertStarted, IslandSettings } from "../appearance/types";
import { sessionKey } from "./unseen.ts";
import { replyEnding } from "./sessionLight.ts";

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
 *
 * How a finished turn ended (`replyEnding`: the reply status marker of roadmap B9, else whether the
 * reply asks something) decides its alert: one
 * that waits for the user's reply alerts as waiting, one that waits for its own background task
 * does not alert (it goes on by itself), and a done one alerts as completed.
 */
export function alertKind(before: Phase | undefined, after: Phase, marker: ReplyMarker | null = null): AgentAlertKind | null {
  if (after === "waiting" && before !== "waiting") return "waiting";
  if (after === "running" && (before === undefined || before === "completed" || before === "failed")) return "started";
  if (before === undefined) return null;
  if (after === "failed" && before !== "failed") return "failed";
  if (after === "completed" && (before === "running" || before === "waiting" || before === "stale")) {
    return marker === "yourTurn" ? "waiting" : marker === "background" ? null : "completed";
  }
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
    const kind = alertKind(previous.phases.get(key), session.phase, replyEnding(session));
    if (!kind) return [];
    const on = kind === "started"
      ? kinds.started === "everyTurn" || (kinds.started === "newSession" && !previous.worked.has(key))
      : kinds[kind];
    return on ? [{ kind, session }] : [];
  });
}

/** A session that needs the user: waiting for approval or an answer, or (with the reply status marker) a finished turn ending on "your turn". */
export function isWaitingOnUser(session: AgentSessionSummary) {
  return session.phase === "waiting" || (session.phase === "completed" && session.replyMarker === "yourTurn");
}

/** Since when each session has waited on the user (`provider:sessionId` → Unix ms), and those already reminded. */
export type WaitingReminders = { since: Map<string, number>; reminded: Set<string> };

/**
 * Notes which sessions wait on the user now: a session starts its wait when first seen waiting,
 * and one that stopped waiting is forgotten, so its next wait gets its own reminder. Run on every
 * change of the session list, so a wait answered between two reminder checks still ends.
 */
export function trackWaiting(state: WaitingReminders, sessions: AgentSessionSummary[], now: number) {
  const waiting = new Set<string>();
  for (const session of sessions) {
    if (!isWaitingOnUser(session)) continue;
    const key = sessionKey(session);
    waiting.add(key);
    if (!state.since.has(key)) state.since.set(key, now);
  }
  for (const key of [...state.since.keys()]) {
    if (!waiting.has(key)) {
      state.since.delete(key);
      state.reminded.delete(key);
    }
  }
}

/**
 * The sessions due a reminder: waiting on the user for `delayMs` or more and not reminded yet in
 * this wait. `looked` ones (the user already saw them, roadmap B15) are not reminded about.
 */
export function takeDueReminders(state: WaitingReminders, sessions: AgentSessionSummary[], now: number, delayMs: number, looked: (session: AgentSessionSummary) => boolean = () => false) {
  trackWaiting(state, sessions, now);
  const due: AgentSessionSummary[] = [];
  for (const session of sessions) {
    const key = sessionKey(session);
    const since = state.since.get(key);
    if (since !== undefined && now - since >= delayMs && !state.reminded.has(key) && !looked(session)) {
      state.reminded.add(key);
      due.push(session);
    }
  }
  return due;
}
