import type { AgentSessionSummary } from "../api";

/** The agent moments that can make a sound, in the order the Sounds page lists them. */
export const AGENT_SOUND_EVENTS = ["start", "complete", "error", "approval", "question", "ack"] as const;

export type AgentSoundEvent = (typeof AGENT_SOUND_EVENTS)[number];

export function isAgentSoundEvent(value: unknown): value is AgentSoundEvent {
  return typeof value === "string" && (AGENT_SOUND_EVENTS as readonly string[]).includes(value);
}

type Phase = AgentSessionSummary["phase"];

/** Claude Code's tool for multiple-choice questions to the user. */
const QUESTION_TOOL = "AskUserQuestion";

/**
 * The sound a session's change from `before` to `after` calls for. A session seen for the
 * first time only sounds when it starts running (a new session) or already waits for the user;
 * one that shows up finished is an old session coming into the listed time window. A finished
 * turn whose reply ends on the "your turn" marker (roadmap B9) asks the user something, so it
 * sounds as a question; one waiting for its own background task makes no sound yet.
 */
export function soundFor(
  before: Phase | undefined,
  after: Phase,
  session: Pick<AgentSessionSummary, "currentTool" | "replyMarker">,
): AgentSoundEvent | null {
  if (after === "waiting" && before !== "waiting") {
    return session.currentTool?.name === QUESTION_TOOL ? "question" : "approval";
  }
  if (before === undefined) return after === "running" ? "start" : null;
  if (after === "failed" && before !== "failed") return "error";
  if (after === "completed" && (before === "running" || before === "waiting" || before === "stale")) {
    return session.replyMarker === "yourTurn" ? "question" : session.replyMarker === "background" ? null : "complete";
  }
  // A finished session running again means the user just sent it a new prompt.
  if (after === "running" && (before === "completed" || before === "failed")) return "ack";
  return null;
}
