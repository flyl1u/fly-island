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
 * one that shows up finished is an old session coming into the listed time window.
 */
export function soundFor(before: Phase | undefined, after: Phase, session: Pick<AgentSessionSummary, "currentTool">): AgentSoundEvent | null {
  if (after === "waiting" && before !== "waiting") {
    return session.currentTool?.name === QUESTION_TOOL ? "question" : "approval";
  }
  if (before === undefined) return after === "running" ? "start" : null;
  if (after === "failed" && before !== "failed") return "error";
  if (after === "completed" && (before === "running" || before === "waiting" || before === "stale")) return "complete";
  // A finished session running again means the user just sent it a new prompt.
  if (after === "running" && (before === "completed" || before === "failed")) return "ack";
  return null;
}
