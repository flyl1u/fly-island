import { readJson, writeJson } from "../../lib/storage.ts";
import type { AgentSessionSummary } from "./api";
import { sessionKey } from "./unseen.ts";

export const HIDDEN_SESSIONS_STORAGE_KEY = "focusd-island-agent-hidden-sessions";
/** Older entries are dropped past this many. */
export const MAX_HIDDEN = 200;

/**
 * Sessions the user removed from the Agent page: `provider:sessionId` → the session's
 * `updatedAt` when it was removed. Some sessions never report their end (the VS Code extensions
 * skip SessionEnd), so they would stay listed as running; removing only hides them, and one that
 * writes to its file again comes back.
 */
export type HiddenSessions = Record<string, number>;

type SessionStamp = Pick<AgentSessionSummary, "provider" | "sessionId" | "updatedAt">;

export function isHidden(session: SessionStamp, hidden: HiddenSessions) {
  const at = hidden[sessionKey(session)];
  return at !== undefined && session.updatedAt <= at;
}

export function hideSession(hidden: HiddenSessions, session: SessionStamp): HiddenSessions {
  const key = sessionKey(session);
  const entries = Object.entries(hidden).filter(([other]) => other !== key);
  entries.push([key, session.updatedAt]);
  return Object.fromEntries(entries.slice(-MAX_HIDDEN));
}

export function unhideSession(hidden: HiddenSessions, key: string): HiddenSessions {
  if (!(key in hidden)) return hidden;
  const { [key]: _removed, ...rest } = hidden;
  return rest;
}

/** `hidden` without the sessions that came back (changed since); the same object when none did. */
export function forgetReturned(hidden: HiddenSessions, sessions: SessionStamp[]): HiddenSessions {
  const returned = sessions.filter((session) => {
    const at = hidden[sessionKey(session)];
    return at !== undefined && session.updatedAt > at;
  });
  return returned.reduce((current, session) => unhideSession(current, sessionKey(session)), hidden);
}

export function normalizeHiddenSessions(value: unknown): HiddenSessions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]),
  );
  return Object.fromEntries(entries.slice(-MAX_HIDDEN));
}

export function loadHiddenSessions(): HiddenSessions {
  return normalizeHiddenSessions(readJson(HIDDEN_SESSIONS_STORAGE_KEY));
}

export function saveHiddenSessions(hidden: HiddenSessions) {
  writeJson(HIDDEN_SESSIONS_STORAGE_KEY, hidden);
}
