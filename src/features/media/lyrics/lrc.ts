/** One timed line of lyrics. */
export type LyricLine = { timeMs: number; text: string };

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const OFFSET_TAG = /^\[offset:\s*([+-]?\d+)\s*\]/i;

/**
 * Parses LRC text into timed lines, sorted by time. A line may carry several time tags
 * ("[00:12.00][01:30.00]chorus"); `[offset:+500]` shifts every line earlier by that many ms, as
 * the format defines. Lines without a time tag (titles, credits) are dropped, and so are empty
 * lines except as breaks between verses.
 */
export function parseLrc(text: string): LyricLine[] {
  let offsetMs = 0;
  const lines: LyricLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const offset = OFFSET_TAG.exec(raw.trim());
    if (offset) {
      offsetMs = Number.parseInt(offset[1], 10);
      continue;
    }
    const times: number[] = [];
    let rest = raw;
    for (const match of raw.matchAll(TIME_TAG)) {
      const fraction = match[3] ?? "0";
      const ms = fraction.length === 1 ? Number(fraction) * 100 : fraction.length === 2 ? Number(fraction) * 10 : Number(fraction);
      times.push(Number(match[1]) * 60_000 + Number(match[2]) * 1000 + ms);
      rest = rest.replace(match[0], "");
    }
    const lineText = rest.trim();
    for (const timeMs of times) lines.push({ timeMs, text: lineText });
  }
  return lines
    .map((line) => ({ ...line, timeMs: Math.max(0, line.timeMs - offsetMs) }))
    .sort((a, b) => a.timeMs - b.timeMs);
}

/** Index of the line being sung at `positionMs`, or -1 before the first line. */
export function lineIndexAt(lines: LyricLine[], positionMs: number) {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (lines[middle].timeMs <= positionMs) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/** Where playback is now: the position Windows gave at `updatedAt`, moved on while playing. */
export function playbackPosition(
  state: { positionMs: number; durationMs: number; updatedAt: number; playbackStatus: string },
  now: number,
) {
  const moved = state.playbackStatus === "playing" ? Math.max(0, now - state.updatedAt) : 0;
  const position = state.positionMs + moved;
  return state.durationMs > 0 ? Math.min(position, state.durationMs) : position;
}

/** Identifies a track for looking its lyrics up once. */
export function trackKey(state: { title: string | null; artist: string | null; durationMs: number }) {
  return state.title ? `${state.title}\u001f${state.artist ?? ""}\u001f${Math.round(state.durationMs / 2000)}` : null;
}
