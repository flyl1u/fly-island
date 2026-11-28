import { useEffect, useState, useSyncExternalStore } from "react";
import type { MediaState } from "../api";
import { getLyrics, listenAppleMusicTokenChanged } from "./api";
import { useNativePlugins } from "../../plugins";
import { parseLrc, trackKey, withTranslations, type LyricLine } from "./lrc";

export type LyricsSettings = { lyricsFolder: string; lyricsOnline: boolean; lyricsChinese?: boolean; lyricWordFill?: boolean; lyricsAppleMusic?: boolean; lyricsLxPort?: number };

/** LX Music serves its own lyrics over a local open-api, so its player needs no online toggle. */
export function isLxMusicPlayer(sourceAppId: string | null | undefined): boolean {
  return /lx[-_]?music/i.test(sourceAppId ?? "");
}

type Found = { lookup: string; lines: LyricLine[]; durationMs: number; expiresAt: number };
// The last few lookups' answers. The music page mounts again on every visit; without these its
// lyrics arrived a few frames in and re-laid the page out while the island was still resizing.
const recent = new Map<string, Found>();
const pending = new Map<string, Promise<Found>>();
const RECENT_LIMIT = 8;
const MISS_TTL_MS = 60_000;

function remember(lookup: string, found: Found) {
  recent.delete(lookup);
  recent.set(lookup, found);
  if (recent.size > RECENT_LIMIT) recent.delete(recent.keys().next().value ?? lookup);
}

// Bumped when the held answers stop being valid; it is part of every lookup so the islands
// and the music page ask again instead of reading the old answer.
let generation = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const readGeneration = () => generation;

/**
 * Drops every answer held in memory. The Apple Music token changed, and an answer asked with
 * the old one (official lyrics, or none because there was no token) must not be shown again.
 */
export function forgetLyrics() {
  recent.clear();
  pending.clear();
  generation += 1;
  listeners.forEach((listener) => listener());
}

// The token is saved from the settings window, so the native side tells this one (main).
function listenForTokenChanges() {
  let disposed = false;
  let stop: (() => void) | undefined;
  void listenAppleMusicTokenChanged(forgetLyrics)
    .then((unlisten) => { if (disposed) unlisten(); else stop = unlisten; })
    .catch((error: unknown) => console.error("Failed to listen for the Apple Music token", error));
  return () => { disposed = true; stop?.(); };
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
  enabled = true,
): { lines: LyricLine[] | null; notFound: boolean; durationMs: number } {
  const key = trackKey(mediaState);
  const folder = settings.lyricsFolder.trim();
  const [found, setFound] = useState<Found | null>(null);
  // Read when the track changes, not on every poll that moves the position.
  const { title, artist, album, durationMs, trackId, sourceApp: sourceAppId } = mediaState;
  const lxPlayer = isLxMusicPlayer(sourceAppId);
  const active = enabled && Boolean(key) && (folder !== "" || settings.lyricsOnline || settings.lyricsChinese === true || lxPlayer);
  const chinese = settings.lyricsChinese === true;
  const wordFill = settings.lyricWordFill === true;
  const appleMusic = useNativePlugins().appleMusicLyrics && settings.lyricsAppleMusic === true;
  const lxPort = settings.lyricsLxPort ?? 23330;
  const held = useSyncExternalStore(subscribe, readGeneration, () => 0);
  const lookup = [key, folder, settings.lyricsOnline, chinese, appleMusic, trackId, sourceAppId, wordFill, lxPort, held].join("\u001f");

  useEffect(listenForTokenChanges, []);

  useEffect(() => {
    if (!active || !key || !title) return;
    const cached = recent.get(lookup);
    if (cached && cached.expiresAt > Date.now()) return;
    let cancelled = false;
    let request = pending.get(lookup);
    if (!request) {
      request = getLyrics({ title, artist: artist ?? "", album: album ?? "", durationMs, folder, online: settings.lyricsOnline, chinese, appleMusic, trackId: trackId ?? null, sourceAppId, wordFill, lxPort })
      .then((lyrics) => {
        const parsed = lyrics ? parseLrc(lyrics.lrc).filter((line, index, all) => line.text || index < all.length - 1) : [];
        const lines = withTranslations(parsed, lyrics?.translation ? parseLrc(lyrics.translation) : []);
        return { lookup, lines, durationMs: lyrics?.durationMs ?? 0,
          expiresAt: lines.length ? Infinity : Date.now() + MISS_TTL_MS };
      })
      .catch((error: unknown) => {
        console.error("Failed to look up lyrics", error);
        return { lookup, lines: [], durationMs: 0, expiresAt: Date.now() + MISS_TTL_MS };
      })
      .then((answer) => {
        remember(lookup, answer);
        pending.delete(lookup);
        return answer;
      });
      pending.set(lookup, request);
    }
    void request.then((answer) => { if (!cancelled) setFound(answer); });
    return () => {
      cancelled = true;
    };
    // Duration/album refine the request, but late metadata must not restart the same lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key, folder, settings.lyricsOnline, chinese, appleMusic, trackId, sourceAppId, wordFill, lxPort, held]);

  const current = recent.get(lookup) ?? (found?.lookup === lookup ? found : null);
  if (!active || !current) return { lines: null, notFound: false, durationMs: 0 };
  return current.lines.length === 0
    ? { lines: null, notFound: true, durationMs: 0 }
    : { lines: current.lines, notFound: false, durationMs: current.durationMs };
}
