import { useEffect, useState } from "react";
import type { MediaState } from "../api";
import { lineIndexAt, msUntilNextLine, playbackPosition, type LyricLine } from "./lrc";

/**
 * Lines show this much before their time. Windows reports the player's position a little late,
 * and a line that changes on the beat reads as late; this lands it with the singing.
 */
export const LYRIC_LEAD_MS = 200;

/**
 * The line being sung and the playback position, `offsetMs` later. The line changes
 * `LYRIC_LEAD_MS` early; `position` is the true one, which word-by-word highlighting follows.
 * Rather than checking on an interval (up to a tick late), it wakes when the next line starts.
 */
export function useLyricClock(lines: LyricLine[] | null, mediaState: MediaState, offsetMs: number) {
  const [now, setNow] = useState(() => Date.now());
  const playing = mediaState.playbackStatus === "playing";
  const position = playbackPosition(mediaState, now) - offsetMs;
  const linePosition = position + LYRIC_LEAD_MS;
  const wait = lines && playing ? msUntilNextLine(lines, linePosition) : null;

  useEffect(() => {
    if (wait === null) return;
    // A couple of ms past the start, so the line has begun when it is looked up.
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, wait) + 2);
    return () => window.clearTimeout(timer);
  }, [wait, now]);

  // A new position from the player (seek, pause, resume) is read at once.
  useEffect(() => {
    setNow(Date.now());
  }, [mediaState.updatedAt, mediaState.playbackStatus, offsetMs]);

  return { index: lines ? lineIndexAt(lines, linePosition) : -1, position, playing };
}
