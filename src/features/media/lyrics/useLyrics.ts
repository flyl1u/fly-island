import { useEffect, useState } from "react";
import type { MediaState } from "../api";
import { getLyrics } from "./api";
import { parseLrc, trackKey, withTranslations, type LyricLine } from "./lrc";

export type LyricsSettings = { lyricsFolder: string; lyricsOnline: boolean; lyricsChinese?: boolean };

type Found = { key: string; lines: LyricLine[]; durationMs: number };
// The last few lookups' answers. The music page mounts again on every visit; without these its
// lyrics arrived a few frames in and re-laid the page out while the island was still resizing.
const recent = new Map<string, Found>();
const RECENT_LIMIT = 8;

function remember(lookup: string, found: Found) {
  recent.delete(lookup);
  recent.set(lookup, found);
  if (recent.size > RECENT_LIMIT) recent.delete(recent.keys().next().value ?? lookup);
}

/**
 * Synced lyrics for the playing track, looked up once per track (the native side caches online
 * answers on disk). `lines` is null while looking, when nothing is found, or with neither a
 * folder nor online lyrics set; `notFound` only when a finished lookup found nothing.
 * `durationMs` is the song's length as the lyrics source lists it (0 when it does not).
 */
export function useLyrics(
  mediaState: MediaState,
  settings: LyricsSettings,
): { lines: LyricLine[] | null; notFound: boolean; durationMs: number } {
  const key = trackKey(mediaState);
  const folder = settings.lyricsFolder.trim();
  const active = Boolean(key) && (folder !== "" || settings.lyricsOnline);
  const [found, setFound] = useState<Found | null>(null);
  // Read when the track changes, not on every poll that moves the position.
  const { title, artist, album, durationMs, trackId } = mediaState;
  const chinese = settings.lyricsOnline && settings.lyricsChinese === true;
  const lookup = [key, folder, settings.lyricsOnline, chinese].join("\u001f");

  useEffect(() => {
    if (!active || !key || !title || recent.has(lookup)) return;
    let cancelled = false;
    void getLyrics({ title, artist: artist ?? "", album: album ?? "", durationMs, folder, online: settings.lyricsOnline, chinese, trackId: trackId ?? null })
      .then((lyrics) => {
        const parsed = lyrics ? parseLrc(lyrics.lrc).filter((line, index, all) => line.text || index < all.length - 1) : [];
        const lines = withTranslations(parsed, lyrics?.translation ? parseLrc(lyrics.translation) : []);
        const answer = { key, lines, durationMs: lyrics?.durationMs ?? 0 };
        remember(lookup, answer);
        if (!cancelled) setFound(answer);
      })
      .catch((error: unknown) => {
        // Not remembered: the next visit asks again.
        console.error("Failed to look up lyrics", error);
        if (!cancelled) setFound({ key, lines: [], durationMs: 0 });
      });
    return () => {
      cancelled = true;
    };
    // `key` already covers title, artist and duration; album only refines the lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key, folder, settings.lyricsOnline, chinese]);

  const current = found?.key === key ? found : recent.get(lookup);
  if (!active || !current) return { lines: null, notFound: false, durationMs: 0 };
  return current.lines.length === 0
    ? { lines: null, notFound: true, durationMs: 0 }
    : { lines: current.lines, notFound: false, durationMs: current.durationMs };
}
