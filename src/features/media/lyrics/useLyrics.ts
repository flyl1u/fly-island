import { useEffect, useState } from "react";
import type { MediaState } from "../api";
import { getLyrics } from "./api";
import { parseLrc, trackKey, withTranslations, type LyricLine } from "./lrc";

export type LyricsSettings = { lyricsFolder: string; lyricsOnline: boolean; lyricsChinese?: boolean };

/**
 * Synced lyrics for the playing track, looked up once per track (the native side caches online
 * answers on disk). Null while looking, when nothing is found, or with neither a folder nor
 * online lyrics set.
 */
export function useLyrics(mediaState: MediaState, settings: LyricsSettings): LyricLine[] | null {
  const key = trackKey(mediaState);
  const folder = settings.lyricsFolder.trim();
  const active = Boolean(key) && (folder !== "" || settings.lyricsOnline);
  const [found, setFound] = useState<{ key: string; lines: LyricLine[] } | null>(null);
  // Read when the track changes, not on every poll that moves the position.
  const { title, artist, album, durationMs, trackId } = mediaState;
  const chinese = settings.lyricsOnline && settings.lyricsChinese === true;

  useEffect(() => {
    if (!active || !key || !title) return;
    let cancelled = false;
    void getLyrics({ title, artist: artist ?? "", album: album ?? "", durationMs, folder, online: settings.lyricsOnline, chinese, trackId: trackId ?? null })
      .then((lyrics) => {
        const parsed = lyrics ? parseLrc(lyrics.lrc).filter((line, index, all) => line.text || index < all.length - 1) : [];
        const lines = withTranslations(parsed, lyrics?.translation ? parseLrc(lyrics.translation) : []);
        if (!cancelled) setFound({ key, lines });
      })
      .catch((error: unknown) => {
        console.error("Failed to look up lyrics", error);
        if (!cancelled) setFound({ key, lines: [] });
      });
    return () => {
      cancelled = true;
    };
    // `key` already covers title, artist and duration; album only refines the lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key, folder, settings.lyricsOnline, chinese]);

  if (!active || !found || found.key !== key || found.lines.length === 0) return null;
  return found.lines;
}
