import type { AgentSessionGroup, AgentSessionSort } from "../appearance/types";
import type { AgentSessionSummary } from "./api";
import { sessionLight, type SessionLight } from "./sessionLight.ts";
import { sessionKey } from "./unseen.ts";

/** Fields the Agent page shows; `updatedAt` is left out because it only feeds the age label. */
const SHOWN_FIELDS = ["provider", "sessionId", "cwd", "title", "model", "effort", "phase", "lastMessage", "turnStartedAt", "lastPrompt", "permissionMode", "subagents", "replyMarker", "replyAsks", "backgroundTasks", "compacting", "closed", "contextTokens"] as const;

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

/**
 * One entry per session, the one written last kept: the Agent page keys its rows by
 * `provider:sessionId`, and two rows with one key make React duplicate rows on every poll.
 * The native list already keeps one per session; this guards the page against any source that
 * does not (a Codex thread split over several rollout files did).
 */
export function uniqueSessions(sessions: AgentSessionSummary[]) {
  const newest = new Map<string, AgentSessionSummary>();
  for (const session of sessions) {
    const key = sessionKey(session);
    const kept = newest.get(key);
    if (!kept || session.updatedAt > kept.updatedAt) newest.set(key, session);
  }
  return newest.size === sessions.length ? sessions : sessions.filter((session) => newest.get(sessionKey(session)) === session);
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

const LIGHT_ORDER: Record<SessionLight, number> = { needs: 0, failed: 0, yourTurn: 1, working: 2, stale: 3, done: 4 };

// shortcut: kept in memory, so after a restart the sessions listed then count as first seen at
// their last write; keep it in storage as unseen.ts does if that matters.
const firstSeenAt = new Map<string, number>();

/** When the island first listed the session: its last write then, which for a new one is its start. */
function firstSeen(session: AgentSessionSummary) {
  const key = sessionKey(session);
  const seen = firstSeenAt.get(key) ?? session.updatedAt;
  firstSeenAt.set(key, seen);
  return seen;
}

/**
 * Sessions as the Agent page lists them: in the order `sort` asks (the lights red, orange, green,
 * grey, newest first within each; newest first; or first seen last), under one heading per computer (this one
 * first, then each remote host as met), per project and computer (as met, so the project with the
 * most urgent session comes first), or under none.
 */
export function arrangeSessions(sessions: AgentSessionSummary[], sort: AgentSessionSort, group: AgentSessionGroup) {
  const rank = (session: AgentSessionSummary) => (sort === "status" ? LIGHT_ORDER[sessionLight(session)] : 0);
  const time = sort === "firstSeen" ? firstSeen : (session: AgentSessionSummary) => session.updatedAt;
  const sorted = [...sessions].sort((a, b) => rank(a) - rank(b) || time(b) - time(a));
  const groups = new Map<string, { key: string; host: string | null; project: string | null; sessions: AgentSessionSummary[] }>();
  const local = JSON.stringify([null, null]);
  if (group === "computer") groups.set(local, { key: local, host: null, project: null, sessions: [] });
  for (const session of sorted) {
    const host = group === "none" ? null : session.remoteHost ?? null;
    const project = group === "project" ? sessionProject(session.cwd) : null;
    const key = JSON.stringify([host, project]);
    const found = groups.get(key) ?? { key, host, project, sessions: [] };
    found.sessions.push(session);
    groups.set(key, found);
  }
  return [...groups.values()].filter((found) => found.sessions.length > 0);
}

/** A context size as the cards show it: "860", "8.6k", "128k", "1.2M". */
export function formatTokens(tokens: number) {
  if (tokens < 1000) return String(Math.round(tokens));
  if (tokens < 100_000) return `${(tokens / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (tokens < 1_000_000) return `${Math.round(tokens / 1000)}k`;
  return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}