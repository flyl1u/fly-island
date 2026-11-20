import { lineIndexAt, msUntilNextLine, playbackPosition, type LyricLine } from "./lrc.ts";

/** Keep the existing lead: Windows' position reaches the island slightly late. */
export const LYRIC_LEAD_MS = 200;

/**
 * The playback position right now, for word-by-word highlighting. The collapsed lyric and the
 * music page both ask here, so the same song lights the same words in both places.
 */
export function lyricPositionNow(
  mediaState: Parameters<typeof lyricClockAt>[1],
  offsetMs: number,
) {
  return lyricClockAt(null, mediaState, Date.now(), offsetMs).position;
}

export function lyricClockAt(
  lines: LyricLine[] | null,
  mediaState: Parameters<typeof playbackPosition>[0],
  now: number,
  offsetMs: number,
) {
  const playing = mediaState.playbackStatus === "playing";
  // A positive offset moves the lyrics on: the words run ahead of the music, so the island
  // shows the next line sooner. It is the sign the buttons and the calibration use.
  const position = playbackPosition(mediaState, now) + offsetMs;
  const linePosition = position + LYRIC_LEAD_MS;
  return {
    index: lines ? lineIndexAt(lines, linePosition) : -1,
    position,
    playing,
    wait: lines && playing ? msUntilNextLine(lines, linePosition) : null,
  };
}
