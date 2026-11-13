import { readJson, writeJson } from "../../lib/storage.ts";

export const MEDIA_DIAGNOSTICS_DISMISSED_KEY = "focusd-island-media-diagnostics-dismissed";

export function loadMediaDiagnosticsDismissed(): string[] {
  const value = readJson(MEDIA_DIAGNOSTICS_DISMISSED_KEY);
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && /^.+\u001f(noTimeline|needsUpdate|smtcOff|neteaseNeedsPlugin)$/.test(item)))];
}

export function saveMediaDiagnosticsDismissed(value: string[]) {
  writeJson(MEDIA_DIAGNOSTICS_DISMISSED_KEY, value);
}

export type KnownMediaSource = {
  id: string;
  label: string;
};

export const MUSIC_SOURCE_PRIORITY_STORAGE_KEY = "focusd-island-music-sources";
/**
 * Fired on this window after the order is saved: the storage event only reaches other windows,
 * and Settings may be open inside the island.
 */
export const MUSIC_SOURCE_PRIORITY_SAVED_EVENT = "focusd-island-music-sources-saved";

export function loadMusicSourcePriority(): KnownMediaSource[] {
  try {
    const stored = window.localStorage.getItem(
      MUSIC_SOURCE_PRIORITY_STORAGE_KEY,
    );

    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored) as Partial<KnownMediaSource>[];

    if (!Array.isArray(parsed)) {
      return [];
    }

    const seen = new Set<string>();
    return parsed
      .filter(
        (source): source is KnownMediaSource =>
          typeof source?.id === "string" &&
          source.id.length > 0 &&
          typeof source.label === "string",
      )
      .filter((source) => {
        if (seen.has(source.id)) {
          return false;
        }
        seen.add(source.id);
        return true;
      })
      .map((source) => ({ id: source.id, label: source.label }));
  } catch {
    return [];
  }
}

export function saveMusicSourcePriority(priority: KnownMediaSource[]) {
  try {
    window.localStorage.setItem(
      MUSIC_SOURCE_PRIORITY_STORAGE_KEY,
      JSON.stringify(priority),
    );
    window.dispatchEvent(new Event(MUSIC_SOURCE_PRIORITY_SAVED_EVENT));
  } catch {
    // Ignore storage write failures (private mode, quota, etc.).
  }
}
