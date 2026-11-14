/** A word (or syllable) of a line, sung from `startMs` to `endMs`. */
export type LyricWord = { startMs: number; endMs: number; text: string };

/** One timed line of lyrics; `words` when the source times each word (enhanced LRC). */
export type LyricLine = { timeMs: number; text: string; translation?: string; words?: LyricWord[] };

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const WORD_TAG = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g;

function tagMs(minutes: string, seconds: string, fraction = "0") {
  const ms = fraction.length === 1 ? Number(fraction) * 100 : fraction.length === 2 ? Number(fraction) * 10 : Number(fraction);
  return Number(minutes) * 60_000 + Number(seconds) * 1000 + ms;
}

/**
 * The words of a line's text with enhanced-LRC word times (`<00:17.51>Oh <00:17.80>I <00:19.75>`):
 * each word lasts until the next time; text before the first time starts with the line.
 * Undefined when the text has no word times.
 */
function wordsOf(text: string, lineMs: number): { text: string; words?: LyricWord[] } {
  const tags = [...text.matchAll(WORD_TAG)];
  if (tags.length === 0) return { text: text.trim() };
  const marks = tags.map((tag) => ({ ms: tagMs(tag[1], tag[2], tag[3]), at: tag.index, end: tag.index + tag[0].length }));
  const words: LyricWord[] = [];
  const lead = text.slice(0, marks[0].at);
  if (lead.trim()) words.push({ startMs: lineMs, endMs: marks[0].ms, text: lead });
  marks.forEach((mark, index) => {
    const next = marks[index + 1];
    const word = text.slice(mark.end, next ? next.at : text.length);
    if (word) words.push({ startMs: mark.ms, endMs: next ? next.ms : mark.ms, text: word });
  });
  if (words.length > 0) words[0] = { ...words[0], text: words[0].text.trimStart() };
  const plain = words.map((word) => word.text).join("").trim();
  return words.some((word) => word.text.trim()) ? { text: plain, words } : { text: plain };
}
const OFFSET_TAG = /^\[offset:\s*([+-]?\d+)\s*\]/i;

/**
 * Parses LRC text into timed lines, sorted by time. A line may carry several time tags
 * ("[00:12.00][01:30.00]chorus"); `[offset:+500]` shifts every line earlier by that many ms, as
 * the format defines. Lines without a time tag (titles, credits) are dropped, and so are empty
 * lines except as breaks between verses. Word times move with the line's offset, and a line
 * repeated at several times keeps its words' spacing from the first.
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
      times.push(tagMs(match[1], match[2], match[3]));
      rest = rest.replace(match[0], "");
    }
    if (times.length === 0) continue;
    const { text: lineText, words } = wordsOf(rest, times[0]);
    for (const timeMs of times) {
      const shift = timeMs - times[0];
      const moved = words?.map((word) => ({ ...word, startMs: word.startMs + shift, endMs: word.endMs + shift }));
      lines.push(moved ? { timeMs, text: lineText, words: moved } : { timeMs, text: lineText });
    }
  }
  const early = (ms: number) => Math.max(0, ms - offsetMs);
  return lines
    .map((line) => ({
      ...line,
      timeMs: early(line.timeMs),
      ...(line.words && { words: line.words.map((word) => ({ ...word, startMs: early(word.startMs), endMs: early(word.endMs) })) }),
    }))
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

/** Milliseconds from `positionMs` until the next line after it starts, or null past the last line. */
export function msUntilNextLine(lines: LyricLine[], positionMs: number) {
  const next = lines[lineIndexAt(lines, positionMs) + 1];
  return next ? next.timeMs - positionMs : null;
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

/** Lookup identity stays the same when a player supplies the missing duration later. */
export function trackKey(state: { title: string | null; artist: string | null; durationMs: number }) {
  return state.title ? `${state.title}\u001f${state.artist ?? ""}` : null;
}

/** Preserve the existing on-disk per-song offset keys, including their duration bucket. */
export function songOffsetKey(state: { title: string | null; artist: string | null; durationMs: number }) {
  return state.title ? `${state.title}\u001f${state.artist ?? ""}\u001f${Math.round(state.durationMs / 2000)}` : null;
}

/** `lines` with the line of `translation` that starts at the same time (within 50 ms) attached. */
export function withTranslations(lines: LyricLine[], translation: LyricLine[]): LyricLine[] {
  if (translation.length === 0) return lines;
  return lines.map((line) => {
    const match = translation.find((other) => Math.abs(other.timeMs - line.timeMs) < 50 && other.text);
    return match && line.text ? { ...line, translation: match.text } : line;
  });
}

/**
 * How a word's highlight runs from `positionMs` on: it waits `delayMs` (negative when the word
 * began already) and fills over `durationMs`. A word with no length lights at once.
 */
export function wordFill(word: LyricWord, positionMs: number) {
  return { delayMs: Math.round(word.startMs - positionMs), durationMs: Math.max(1, word.endMs - word.startMs) };
}
