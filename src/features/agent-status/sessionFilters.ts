import { readJson, writeJson } from "../../lib/storage.ts";
import type { AgentSessionSummary } from "./api";

export const SESSION_FILTERS_STORAGE_KEY = "focusd-island-agent-session-filters";
/** More rules than anyone keeps by hand; later ones are dropped. */
export const MAX_SESSION_FILTERS = 50;

/**
 * A rule hiding agent sessions everywhere on the island (roadmap B6.4.3): those working in a
 * folder (or one inside it), or whose title or latest prompt contains some text. The title is
 * the agent's own title, else the session's first prompt.
 */
export type SessionFilter = { kind: "folder"; value: string } | { kind: "prompt"; value: string };

/** A folder as compared: forward slashes, no trailing slash, lower case (Windows paths ignore case). */
export function folderKey(path: string) {
  return path.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export function matchesFilter(session: Pick<AgentSessionSummary, "cwd" | "title" | "lastPrompt">, filter: SessionFilter) {
  if (filter.kind === "folder") {
    if (!session.cwd) return false;
    const cwd = folderKey(session.cwd);
    const folder = folderKey(filter.value);
    return folder !== "" && (cwd === folder || cwd.startsWith(`${folder}/`));
  }
  const text = filter.value.trim().toLowerCase();
  return text !== "" && [session.title, session.lastPrompt].some((field) => field?.toLowerCase().includes(text));
}

/** `sessions` without those a rule hides; the same array when none is hidden. */
export function applySessionFilters<T extends Pick<AgentSessionSummary, "cwd" | "title" | "lastPrompt">>(sessions: T[], filters: readonly SessionFilter[]) {
  if (filters.length === 0) return sessions;
  const shown = sessions.filter((session) => !filters.some((filter) => matchesFilter(session, filter)));
  return shown.length === sessions.length ? sessions : shown;
}

/** Saved rules, keeping only well-formed, non-empty, distinct ones. */
export function normalizeSessionFilters(value: unknown): SessionFilter[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const filters: SessionFilter[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { kind, value: text } = item as Record<string, unknown>;
    if ((kind !== "folder" && kind !== "prompt") || typeof text !== "string" || !text.trim()) continue;
    const key = `${kind}:${kind === "folder" ? folderKey(text) : text.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    filters.push({ kind, value: text.trim() });
  }
  return filters.slice(0, MAX_SESSION_FILTERS);
}

export function loadSessionFilters() {
  return normalizeSessionFilters(readJson(SESSION_FILTERS_STORAGE_KEY));
}

export function saveSessionFilters(filters: readonly SessionFilter[]) {
  writeJson(SESSION_FILTERS_STORAGE_KEY, filters);
}
