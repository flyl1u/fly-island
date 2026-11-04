import type { AgentSessionSummary } from "./api";

/** Fields the Agent page shows; `updatedAt` is left out because it only feeds the age label. */
const SHOWN_FIELDS = ["provider", "sessionId", "cwd", "title", "model", "effort", "phase", "lastMessage"] as const;

export function sameAgentSessions(a: AgentSessionSummary[], b: AgentSessionSummary[]) {
  return (
    a.length === b.length &&
    a.every((session, index) => {
      const other = b[index];
      // Ages are shown in minutes, so a newer write only matters once a minute has passed.
      return (
        SHOWN_FIELDS.every((field) => session[field] === other[field]) &&
        Math.floor(session.updatedAt / 60_000) === Math.floor(other.updatedAt / 60_000)
      );
    })
  );
}

/** Sessions still working: running, or silent mid-turn for a while (stale). */
export function countActiveSessions(sessions: AgentSessionSummary[]) {
  return sessions.filter((session) => session.phase === "running" || session.phase === "stale").length;
}

/** The last folder of a session's working directory. */
export function sessionProject(cwd: string | null) {
  if (!cwd) return null;
  const parts = cwd.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] || null;
}

/** Whole minutes since `updatedAt`, never negative. */
export function minutesAgo(updatedAt: number, now: number) {
  return Math.max(0, Math.floor((now - updatedAt) / 60_000));
}

/** "medium" → "Medium"; model and effort joined as the reference shows them. */
export function modelLabel(model: string | null, effort: string | null) {
  const effortLabel = effort ? effort.charAt(0).toUpperCase() + effort.slice(1) : null;
  return [model, effortLabel].filter(Boolean).join(" · ") || null;
}
