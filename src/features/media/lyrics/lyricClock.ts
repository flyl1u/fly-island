import { lineIndexAt, msUntilNextLine, playbackPosition, type LyricLine } from "./lrc.ts";

/** Keep the existing lead: Windows' position reaches the island slightly late. */
export const LYRIC_LEAD_MS = 200;

export function lyricClockAt(
  lines: LyricLine[] | null,
  mediaState: Parameters<typeof playbackPosition>[0],
  now: number,
  offsetMs: number,
) {
  const playing = mediaState.playbackStatus === "playing";
  const position = playbackPosition(mediaState, now) - offsetMs;
  const linePosition = position + LYRIC_LEAD_MS;
  return {
    index: lines ? lineIndexAt(lines, linePosition) : -1,
    position,
    playing,
    wait: lines && playing ? msUntilNextLine(lines, linePosition) : null,
  };
}
