import type { AgentSessionSummary } from "./api";
import { sessionKey } from "./unseen.ts";

/**
 * When a session's change is worth a sound or a pop-up: the user's own task finished, a wait on
 * an approval, or a question to answer (docs/design/agent.md, "Sounds and pop-ups"). The sounds
 * and the pop-ups each keep their own `Announced`, so turning one off leaves the other as it was.
 */

/**
 * How long a finished turn has to stay finished before it is announced. An agent that carries on
 * by itself (a background task's result, a queued prompt) runs again within moments: that was a
 * step of the task, not its end.
 */
export const COMPLETE_SETTLE_MS = 6_000;
/**
 * How long a wait on the user has to last before it is announced. In auto mode most permission
 * requests are approved by themselves within a second or two; those never needed the user.
 */
export const WAIT_SETTLE_MS = 3_000;
/**
 * After an approval was announced, the same session's next ones stay quiet this long: a run of
 * tool calls asking one after another is one interruption, not one per call.
 */
export const APPROVAL_REPEAT_MS = 120_000;

/**
 * The waits the hooks use, read when each change comes in. Regression pages set them to 0 to
 * check the pop-ups without sitting through them.
 */
export const announceTiming = { completeMs: COMPLETE_SETTLE_MS, waitMs: WAIT_SETTLE_MS, approvalRepeatMs: APPROVAL_REPEAT_MS };

/** Claude Code's tool for multiple-choice questions to the user. */
export const QUESTION_TOOL = "AskUserQuestion";

type Prompted = Pick<AgentSessionSummary, "turnStartedAt" | "ownerPromptAt">;
type Turn = Pick<AgentSessionSummary, "provider" | "sessionId" | "phase"> & Prompted;
type Wait = Pick<AgentSessionSummary, "provider" | "sessionId" | "phase" | "currentTool">;

/** What has been announced: the typed prompt each finished turn was announced for, and when each session's last approval was. */
export type Announced = { finished: Map<string, number | null>; approvals: Map<string, number> };

export function emptyAnnounced(): Announced {
  return { finished: new Map(), approvals: new Map() };
}

/**
 * Whether the session's current turn answers a prompt the user typed. Turns Claude Code started by
 * itself (a background task ended, another session reported, a side session it started) are not,
 * and neither is any turn of a session nobody typed into. A build that does not send
 * `ownerPromptAt`, or a session whose prompt is not known at all, counts as the user's.
 */
export function isUsersTurn(session: Prompted): boolean {
  if (session.ownerPromptAt === undefined || session.ownerPromptAt !== null) return true;
  return session.turnStartedAt === null;
}

/**
 * The `pending` finished turns to announce now: still finished in `current`, the user's own, and
 * not of a typed prompt already announced. A turn the agent continued by itself keeps that prompt,
 * so its later stops stay quiet. Marks the returned turns in `announced`.
 */
export function settledFinishes<T extends Turn>(pending: T[], current: Turn[], announced: Announced): T[] {
  const now = new Map(current.map((session) => [sessionKey(session), session]));
  return pending.filter((session) => {
    const key = sessionKey(session);
    const latest = now.get(key);
    if (latest?.phase !== "completed" || !isUsersTurn(latest)) return false;
    const prompt = latest.ownerPromptAt ?? latest.turnStartedAt ?? null;
    if (prompt !== null && announced.finished.get(key) === prompt) return false;
    if (prompt !== null) announced.finished.set(key, prompt);
    return true;
  });
}

/**
 * The `pending` waits to announce now: still waiting in `current` after `WAIT_SETTLE_MS`, and for
 * an approval, not within `repeatMs` (`APPROVAL_REPEAT_MS`) of the session's last announced one. A question
 * (AskUserQuestion) always counts. Marks the returned approvals in `announced`.
 */
export function settledWaits<T extends Wait>(pending: T[], current: Wait[], announced: Announced, now: number, repeatMs = announceTiming.approvalRepeatMs): T[] {
  const latest = new Map(current.map((session) => [sessionKey(session), session]));
  return pending.filter((session) => {
    const key = sessionKey(session);
    const still = latest.get(key);
    if (still?.phase !== "waiting") return false;
    if (still.currentTool?.name === QUESTION_TOOL) return true;
    const last = announced.approvals.get(key);
    if (last !== undefined && now - last < repeatMs) return false;
    announced.approvals.set(key, now);
    return true;
  });
}
