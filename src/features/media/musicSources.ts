import type { MediaSessionInfo, MediaState } from "./api";
import type { KnownMediaSource } from "./storage";
import { DEFAULT_MEDIA_STATE } from "./mediaState.ts";

const ids = (source: { id: string; aliases?: string[] }) => [source.id, ...(source.aliases ?? [])];

/** Keep adoption and position when a plain audio app starts publishing SMTC metadata. */
export function mergeMusicSources(current: KnownMediaSource[], sessions: readonly MediaSessionInfo[]): KnownMediaSource[] {
  if (sessions.length === 0) return current;
  const result: KnownMediaSource[] = [];
  for (const source of [...current, ...sessions]) {
    const live = sessions.find((session) => ids(session).some((id) => ids(source).includes(id)));
    const next = live ? {
      ...source, id: live.id, label: live.label,
      aliases: [...new Set([...ids(source), ...ids(live)])].filter((id) => id !== live.id),
    } : source;
    const duplicate = result.find((entry) => entry.id === next.id);
    if (duplicate) {
      if ("enabled" in next && next.enabled === false) duplicate.enabled = false;
    } else {
      result.push({
        id: next.id, label: next.label,
        ...("enabled" in next && next.enabled === false ? { enabled: false } : {}),
        ...(next.aliases?.length ? { aliases: next.aliases } : {}),
      });
    }
  }
  return JSON.stringify(current) === JSON.stringify(result) ? current : result;
}

export function excludedMusicSources(sources: readonly KnownMediaSource[]): string[] {
  return [...new Set(sources.filter((source) => source.enabled === false).flatMap(ids))];
}

/** A native response may arrive after the user has excluded its selected source. */
export function adoptedMediaState(state: MediaState, preferences: readonly KnownMediaSource[]): MediaState {
  const excluded = new Set(excludedMusicSources(preferences));
  const active = state.sessions.find((session) => session.id === state.activeSessionId);
  if (![state.activeSessionId, ...(active?.aliases ?? [])].some((id) => id && excluded.has(id))) return state;
  return { ...DEFAULT_MEDIA_STATE, controlMode: "none", resumeBlocked: true, sessions: state.sessions, volume: state.volume };
}
