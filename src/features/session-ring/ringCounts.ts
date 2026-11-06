import type { AgentSessionSummary } from "../agent-status/api";
import { sessionProject } from "../agent-status/sessionList.ts";
import { sessionKey } from "../agent-status/unseen.ts";
import type { SessionRingText } from "../../i18n/sections/sessionRing";

export type RingSegment = { value: number; color: string };

export type SessionRingState = "needs" | "yourturn" | "working" | "stale" | "done";

export type SessionRingCounts = Record<SessionRingState, number> & { total: number };

/** Finished sessions the user has seen stay in the ring as grey for this long after their last write. */
export const DONE_WINDOW_MS = 10 * 60_000;

/** Ring order and colours, from 12 o'clock; stale is a dimmed running green. */
export const SESSION_RING_STATES: readonly { key: SessionRingState; color: string }[] = [
  { key: "needs", color: "#FF453A" },
  { key: "yourturn", color: "#FFD60A" },
  { key: "working", color: "#34C759" },
  { key: "stale", color: "rgba(52, 199, 89, 0.45)" },
  { key: "done", color: "#8E8E93" },
];

/**
 * Where a session sits on the ring: waiting for approval or an answer is red, running green,
 * silent mid-turn dim green. A finished turn is yellow when it waits for the user's reply and grey
 * when done, while unseen or for 10 minutes after; older finished ones are left out. With the reply
 * status marker on, the reply's last line says which (a "background" one still works, so green);
 * without it, a turn the user has not looked at yet counts as waiting.
 */
export function sessionRingState(session: AgentSessionSummary, unseen: ReadonlySet<string>, now: number): SessionRingState | null {
  switch (session.phase) {
    case "waiting":
      return "needs";
    case "running":
      return "working";
    case "stale":
      return "stale";
    default: {
      const isUnseen = unseen.has(sessionKey(session));
      const recent = isUnseen || now - session.updatedAt <= DONE_WINDOW_MS;
      switch (session.phase === "completed" ? session.replyMarker : null) {
        case "yourTurn":
          return "yourturn";
        case "background":
          return "working";
        case "done":
          return recent ? "done" : null;
        default:
          if (isUnseen) return "yourturn";
          return recent ? "done" : null;
      }
    }
  }
}

export function sessionRingCounts(sessions: readonly AgentSessionSummary[], unseen: ReadonlySet<string>, now: number): SessionRingCounts {
  const counts: SessionRingCounts = { needs: 0, yourturn: 0, working: 0, stale: 0, done: 0, total: 0 };
  for (const session of sessions) {
    const state = sessionRingState(session, unseen, now);
    if (state) {
      counts[state] += 1;
      counts.total += 1;
    }
  }
  return counts;
}

/** One segment per state that has sessions, in ring order. */
export function sessionRingSegments(counts: SessionRingCounts): RingSegment[] {
  return SESSION_RING_STATES.filter(({ key }) => counts[key] > 0).map(({ key, color }) => ({ value: counts[key], color }));
}

/** "等你确认 1 · 等你回复 2 · 运行 3 · 完成 1", listing only states that have sessions. */
export function sessionRingSummary(counts: SessionRingCounts, text: SessionRingText): string {
  const parts = SESSION_RING_STATES.filter(({ key }) => counts[key] > 0).map(({ key }) => `${text[key]} ${counts[key]}`);
  return parts.length > 0 ? parts.join(" · ") : text.empty;
}

/** How many sessions waiting on you the hover card names. */
const CARD_SESSIONS = 3;
/** Longer titles are cut to this many characters plus an ellipsis. */
const CARD_TITLE_LENGTH = 40;

/** "标题 · 项目", the title cut to CARD_TITLE_LENGTH; the id's first 8 characters if both are empty. */
function sessionName({ title, cwd, sessionId }: AgentSessionSummary) {
  const chars = [...(title ?? "")];
  const short = chars.length > CARD_TITLE_LENGTH ? `${chars.slice(0, CARD_TITLE_LENGTH).join("")}…` : chars.join("");
  return [short, sessionProject(cwd)].filter(Boolean).join(" · ") || sessionId.slice(0, 8);
}

/**
 * The ring's hover card: the summary, then up to three sessions waiting on you, the ones that
 * need approval or an answer first, each "等你确认：标题 · 项目".
 */
export function sessionRingCardLines(
  sessions: readonly AgentSessionSummary[],
  unseen: ReadonlySet<string>,
  now: number,
  text: SessionRingText,
): string[] {
  const states = sessions.map((session) => ({ session, state: sessionRingState(session, unseen, now) }));
  const waiting = (["needs", "yourturn"] as const)
    .flatMap((key) => states.filter(({ state }) => state === key).map(({ session }) => text.sessionLine(text[key], sessionName(session))))
    .slice(0, CARD_SESSIONS);
  return [sessionRingSummary(sessionRingCounts(sessions, unseen, now), text), ...waiting];
}
