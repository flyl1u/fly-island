import type { AgentSessionSummary } from "./api";

/** Fields the Agent page shows; `updatedAt` is left out because it only feeds the age label. */
const SHOWN_FIELDS = ["provider", "sessionId", "cwd", "title", "model", "effort", "phase", "lastMessage", "turnStartedAt", "lastPrompt", "permissionMode", "subagents", "replyMarker", "replyAsks"] as const;

export function sameAgentSessions(a: AgentSessionSummary[], b: AgentSessionSummary[]) {
  return (
    a.length === b.length &&
    a.every((session, index) => {
      const other = b[index];
      // Ages are shown in minutes, so a newer write only matters once a minute has passed.
      return (
        SHOWN_FIELDS.every((field) => session[field] === other[field]) &&
        session.host?.exe === other.host?.exe &&
        session.host?.name === other.host?.name &&
        session.currentTool?.name === other.currentTool?.name &&
        session.currentTool?.detail === other.currentTool?.detail &&
        Math.floor(session.updatedAt / 60_000) === Math.floor(other.updatedAt / 60_000)
      );
    })
  );
}

/** Sessions still working: running, waiting for the user, or silent mid-turn for a while (stale). */
export function countActiveSessions(sessions: AgentSessionSummary[]) {
  return sessions.filter((session) => isActivePhase(session.phase)).length;
}

export type SessionFilter = { claudeCode: boolean; codex: boolean };

/** Sessions of the agents the user wants to see. */
export function filterSessions(sessions: AgentSessionSummary[], filter: SessionFilter) {
  const shown = sessions.filter((session) => (session.provider === "codex" ? filter.codex : filter.claudeCode));
  return shown.length === sessions.length ? sessions : shown;
}

export function isActivePhase(phase: AgentSessionSummary["phase"]) {
  return phase === "running" || phase === "waiting" || phase === "stale";
}

/** How long the session's turn has run: until now while it works, until its last write after. */
export function turnElapsedMs(session: AgentSessionSummary, now: number) {
  if (session.turnStartedAt === null) return null;
  const end = isActivePhase(session.phase) ? now : session.updatedAt;
  const elapsed = end - session.turnStartedAt;
  return elapsed >= 0 ? elapsed : null;
}

/** Whole hours, minutes and seconds of `ms`. */
export function durationParts(ms: number) {
  const total = Math.floor(ms / 1000);
  return { hours: Math.floor(total / 3600), minutes: Math.floor((total % 3600) / 60), seconds: total % 60 };
}

/**
 * The last folder of a session's working directory, or the project a worktree belongs to:
 * `<project>-lanes/<N>`, `<project>-lane-<N>` and `<project>/.claude/worktrees/<name>`.
 */
export function sessionProject(cwd: string | null) {
  if (!cwd) return null;
  const parts = cwd.replace(/[\\/]+$/, "").split(/[\\/]/);
  const last = parts[parts.length - 1] || null;
  if (!last) return null;
  const parent = parts[parts.length - 2] ?? "";
  if (/^\d+$/.test(last) && /.-lanes$/.test(parent)) return parent.slice(0, -"-lanes".length);
  const lane = /^(.+)-lane-\d+$/.exec(last);
  if (lane) return lane[1];
  if (parent === "worktrees" && parts[parts.length - 3] === ".claude" && parts[parts.length - 4]) return parts[parts.length - 4];
  return last;
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
