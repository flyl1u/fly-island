import type { AgentSessionSummary } from "../api";
import { QUESTION_TOOL } from "../announce.ts";
import { announcedEnding } from "../sessionLight.ts";

/** The agent moments that can make a sound, in the order the Sounds page lists them. */
export const AGENT_SOUND_EVENTS = ["start", "complete", "error", "approval", "question", "ack", "compact", "idle", "quotaLow", "quotaReset"] as const;

export type AgentSoundEvent = (typeof AGENT_SOUND_EVENTS)[number];

export function isAgentSoundEvent(value: unknown): value is AgentSoundEvent {
  return typeof value === "string" && (AGENT_SOUND_EVENTS as readonly string[]).includes(value);
}

type Phase = AgentSessionSummary["phase"];

/**
 * The sound a session's change from `before` to `after` calls for. A session seen for the
 * first time only sounds when it starts running (a new session) or already waits for the user;
 * one that shows up finished is an old session coming into the listed time window. A finished
 * turn whose reply status marker (roadmap B9) says "your turn" sounds as a question; a reply that
 * merely ends in a question mark does not (`announcedEnding`). One waiting for its own background
 * task makes no sound yet. Whether the sound then plays is decided by `announce.ts`: a finished
 * turn or a wait has to last, and only the user's own tasks are announced.
 */
export function soundFor(
  before: Phase | undefined,
  after: Phase,
  session: Pick<AgentSessionSummary, "currentTool" | "replyMarker" | "backgroundTasks">,
): AgentSoundEvent | null {
  if (after === "waiting" && before !== "waiting") {
    return session.currentTool?.name === QUESTION_TOOL ? "question" : "approval";
  }
  if (before === undefined) return after === "running" ? "start" : null;
  if (after === "failed" && before !== "failed") return "error";
  if (after === "completed" && (before === "running" || before === "waiting" || before === "stale")) {
    const ending = announcedEnding(session);
    return ending === "yourTurn" ? "question" : ending === "background" ? null : "complete";
  }
  // A finished session running again means the user just sent it a new prompt.
  if (after === "running" && (before === "completed" || before === "failed")) return "ack";
  return null;
}

/** The sound of a reminder about a session still waiting on the user: a question, or an approval. */
export function reminderSound(session: Pick<AgentSessionSummary, "currentTool" | "replyMarker" | "phase">): AgentSoundEvent {
  return session.currentTool?.name === QUESTION_TOOL || (session.phase === "completed" && session.replyMarker === "yourTurn") ? "question" : "approval";
}
