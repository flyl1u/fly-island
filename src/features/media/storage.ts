import { readString, writeString } from "../../lib/storage.ts";
export type KnownMediaSource = {
  id: string;
  label: string;
};

export const MUSIC_SOURCE_PRIORITY_STORAGE_KEY = "focusd-island-music-sources";

export function loadMusicSourcePriority(): KnownMediaSource[] {
  try {
    const stored = readString(
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
    writeString(
      MUSIC_SOURCE_PRIORITY_STORAGE_KEY,
      JSON.stringify(priority),
    );
  } catch {
    // Ignore storage write failures (private mode, quota, etc.).
  }
}
