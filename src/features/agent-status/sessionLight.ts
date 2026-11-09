import type { AgentSessionSummary, ReplyMarker } from "./api";

/**
 * How a finished turn ended: the reply status marker when it carries one (B9); else "yourTurn"
 * when the reply asks something (replyAsks), "background" while a background task the turn
 * started still runs (backgroundTasks). Null: done as far as the island can tell.
 */
export function replyEnding(session: Pick<AgentSessionSummary, "replyMarker" | "replyAsks" | "backgroundTasks">): ReplyMarker | null {
  if (session.replyMarker) return session.replyMarker;
  if (session.replyAsks) return "yourTurn";
  return session.backgroundTasks ? "background" : null;
}

/**
 * A session's light, the one judgement every place showing agent state uses (roadmap B11,
 * docs/architecture/agent-session-states.md):
 * - `needs`: stuck mid-turn on the user (a question, an approval or a plan to confirm);
 * - `yourTurn`: the turn is over and Claude asked something;
 * - `working`: running, or waiting on a background task it started (marker ⋯);
 * - `stale`: silent mid-turn for a long while;
 * - `done`: the turn is over and nothing is asked;
 * - `failed`: the turn ended on an error.
 */
export type SessionLight = "needs" | "yourTurn" | "working" | "stale" | "done" | "failed";

type LightFields = Pick<AgentSessionSummary, "phase" | "replyMarker" | "replyAsks" | "backgroundTasks">;

export function sessionLight(session: LightFields): SessionLight {
  switch (session.phase) {
    case "waiting":
      return "needs";
    case "running":
      return "working";
    case "stale":
      return "stale";
    case "failed":
      return "failed";
    default:
      // The reply status marker, when on, says which; otherwise whether the reply ends in a question.
      switch (replyEnding(session)) {
        case "yourTurn":
          return "yourTurn";
        case "background":
          return "working";
        default:
          return "done";
      }
  }
}
