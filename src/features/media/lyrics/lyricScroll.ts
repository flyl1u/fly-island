import type { LyricWord } from "./lrc.ts";

/** A long line rests at its start this long, so it can be read before it moves. */
export const LYRIC_SCROLL_PAUSE_MS = 600;
/** The end of a long line is in view this long before the next line replaces it. */
export const LYRIC_SCROLL_TAIL_MS = 300;
/** With less than this after the pause (or no known end) the line moves at a fixed speed. */
export const LYRIC_SCROLL_MIN_TRAVEL_MS = 800;
/** The fixed speed, in px per second. */
export const LYRIC_SCROLL_SPEED = 40;
/** Where in the view the word being sung is kept: middle-right. */
export const LYRIC_WORD_ANCHOR = 0.65;
// A last word with no end time of its own still takes a moment to pass.
const OPEN_WORD_MS = 400;

/** How far the text has moved left (px) at a song position; straight lines between points. */
export type LyricScrollPoint = { atMs: number; offset: number };

/**
 * A line's travel at an even pace: rest, then reach the end shortly before the line is replaced.
 * `shownAtMs` and `goneAtMs` are the song positions at which the line appears and is replaced
 * (null: the last line). Null when the text fits.
 */
export function planLyricScroll({ distance, shownAtMs, goneAtMs }: {
  distance: number; shownAtMs: number; goneAtMs: number | null;
}): LyricScrollPoint[] | null {
  if (!(distance > 0.5)) return null;
  const startMs = shownAtMs + LYRIC_SCROLL_PAUSE_MS;
  const room = goneAtMs === null ? 0 : goneAtMs - startMs;
  const travelMs = room >= LYRIC_SCROLL_MIN_TRAVEL_MS
    ? room - LYRIC_SCROLL_TAIL_MS
    : (distance / LYRIC_SCROLL_SPEED) * 1000;
  return [{ atMs: startMs, offset: 0 }, { atMs: startMs + travelMs, offset: distance }];
}

/** A word's times and where its text starts and ends from the line's left edge (px). */
export type PlacedWord = Pick<LyricWord, "startMs" | "endMs"> & { left: number; width: number };

/**
 * A word-timed line's travel: it stays put until the sung edge reaches `LYRIC_WORD_ANCHOR` of the
 * view, then follows it there, up to the line's end. The sung edge is therefore always in view.
 * Null when the text fits.
 */
export function planLyricWordScroll({ words, distance, view }: {
  words: PlacedWord[]; distance: number; view: number;
}): LyricScrollPoint[] | null {
  if (!(distance > 0.5) || words.length === 0) return null;
  const anchor = view * LYRIC_WORD_ANCHOR;
  const offsetFor = (edge: number) => Math.min(distance, Math.max(0, edge - anchor));
  const points: LyricScrollPoint[] = [];
  let last = { atMs: words[0].startMs, edge: words[0].left };
  const add = (atMs: number, edge: number) => {
    // Where the offset starts or stops moving inside a word, it needs a point of its own.
    for (const limit of [anchor, anchor + distance]) {
      if (last.edge < limit && edge > limit) {
        const at = last.atMs + ((limit - last.edge) / (edge - last.edge)) * (atMs - last.atMs);
        points.push({ atMs: at, offset: offsetFor(limit) });
      }
    }
    points.push({ atMs, offset: offsetFor(edge) });
    last = { atMs, edge };
  };
  words.forEach((word) => {
    const startMs = Math.max(last.atMs, word.startMs);
    add(startMs, Math.max(last.edge, word.left));
    const endMs = word.endMs > word.startMs ? word.endMs : word.startMs + OPEN_WORD_MS;
    add(Math.max(startMs, endMs), Math.max(last.edge, word.left + word.width));
  });
  return points;
}

/** The offset at `positionMs`: still before the first point and after the last. */
export function lyricScrollOffsetAt(points: LyricScrollPoint[], positionMs: number) {
  if (positionMs <= points[0].atMs) return points[0].offset;
  for (let index = 1; index < points.length; index++) {
    const to = points[index];
    if (positionMs < to.atMs) {
      const from = points[index - 1];
      return from.offset + ((positionMs - from.atMs) / (to.atMs - from.atMs)) * (to.offset - from.offset);
    }
  }
  return points[points.length - 1].offset;
}

/** The soft edge where text is cut off, in px. */
export const LYRIC_FADE_PX = 10;

/** `at` is the frame's place in the animation, 0 to 1. */
export type LyricScrollFrame = { at: number; offset: number; fadeStart: number; fadeEnd: number };

/**
 * The plan as animation frames from the moment the line is shown. An edge fades only while text is
 * hidden past it, so a resting line starts sharp and a finished one ends sharp; the frames include
 * the points where a fade stops growing.
 */
export function lyricScrollFrames(points: LyricScrollPoint[], distance: number, shownAtMs: number) {
  const timed = [{ atMs: Math.min(shownAtMs, points[0].atMs), offset: points[0].offset }, ...points];
  const all: LyricScrollPoint[] = [timed[0]];
  for (let index = 1; index < timed.length; index++) {
    const from = timed[index - 1];
    const to = timed[index];
    for (const limit of [LYRIC_FADE_PX, distance - LYRIC_FADE_PX].sort((a, b) => a - b)) {
      if (from.offset < limit && to.offset > limit) {
        all.push({ atMs: from.atMs + ((limit - from.offset) / (to.offset - from.offset)) * (to.atMs - from.atMs), offset: limit });
      }
    }
    all.push(to);
  }
  const startMs = all[0].atMs;
  const durationMs = Math.max(1, all[all.length - 1].atMs - startMs);
  const frames: LyricScrollFrame[] = all.map((point) => ({
    at: Math.min(1, Math.max(0, (point.atMs - startMs) / durationMs)),
    offset: point.offset,
    fadeStart: Math.min(LYRIC_FADE_PX, Math.max(0, point.offset)),
    fadeEnd: Math.min(LYRIC_FADE_PX, Math.max(0, distance - point.offset)),
  }));
  return { startMs, durationMs, frames };
}
