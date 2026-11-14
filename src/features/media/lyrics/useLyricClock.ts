import { useEffect, useLayoutEffect, useState } from "react";
import type { MediaState } from "../api";
import type { LyricLine } from "./lrc";
import { lyricClockAt } from "./lyricClock";

/**
 * The line being sung and the playback position, `offsetMs` later. The line changes
 * `LYRIC_LEAD_MS` early; `position` is the true one, which word-by-word highlighting follows.
 * Rather than checking on an interval (up to a tick late), it wakes when the next line starts.
 */
export function useLyricClock(lines: LyricLine[] | null, mediaState: MediaState, offsetMs: number, active = true) {
  const [now, setNow] = useState(() => Date.now());
  const { index, position, playing, wait } = lyricClockAt(lines, mediaState, now, offsetMs);

  useEffect(() => {
    if (!active || wait === null) return;
    // A couple of ms past the start, so the line has begun when it is looked up.
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, wait) + 2);
    return () => window.clearTimeout(timer);
  }, [active, wait, now]);

  // Refresh before paint when late lyrics arrive or the dormant collapsed leaf becomes visible.
  useLayoutEffect(() => {
    setNow(Date.now());
  }, [lines, active, mediaState.updatedAt, mediaState.positionMs, mediaState.durationMs,
    mediaState.playbackStatus, mediaState.title, mediaState.artist, offsetMs]);

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return { index, position, playing };
}
