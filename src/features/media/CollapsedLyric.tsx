import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { MediaState } from "./api";
import { songOffsetKey, wordFill, type LyricWord } from "./lyrics/lrc";
import { lyricPositionNow } from "./lyrics/lyricClock";
import { useLyricClock } from "./lyrics/useLyricClock";
import { useLyrics, type LyricsSettings } from "./lyrics/useLyrics";
import { useSongOffset } from "./lyrics/useSongOffset";
import "./CollapsedLyric.css";

// How small the lyric's font may get before the line keeps its ellipsis.
// shortcut: 0.7 (about 9px at the default text size); a longer line is still cut short.
const MIN_LYRIC_FIT = 0.7;

/**
 * A long lyric must not lose its words: when the line does not fit the island, its font
 * shrinks a little so the whole sentence stays readable.
 */
function fitLyric(element: HTMLElement) {
  element.style.setProperty("--lyric-fit", "1");
  const available = element.clientWidth;
  if (available <= 0) return;
  let fit = 1;
  for (let step = 0; step < 3; step += 1) {
    const needed = element.scrollWidth;
    if (needed <= available) break;
    // The text's width follows its font, so the part that does not fit says how much to shrink.
    fit = Math.max(MIN_LYRIC_FIT, fit * (available / needed));
    element.style.setProperty("--lyric-fit", String(fit));
    if (fit <= MIN_LYRIC_FIT) break;
  }
}

/** Snapshot the lyric clock on mount; CSS fills every frame without re-rendering the island. */
function CollapsedSungWords({ words, mediaState, offsetMs, playing }: {
  words: LyricWord[]; mediaState: MediaState; offsetMs: number; playing: boolean;
}) {
  const [start] = useState(() => lyricPositionNow(mediaState, offsetMs));
  return words.map((word, index) => {
    const { delayMs, durationMs } = wordFill(word, start);
    const style = { animationDelay: `${delayMs}ms`, animationDuration: `${durationMs}ms`,
      animationPlayState: playing ? "running" : "paused" } as CSSProperties;
    return <span className="collapsed-lyric__word" key={index} style={style}>{word.text}</span>;
  });
}

/**
 * The line being sung, for the collapsed island; the song's title and artist when it has no
 * lyrics or between lines. It wakes on its own for each line, so only this leaf re-renders while a
 * song plays; a new line replaces the last at once (the music page lets it rise in).
 * Keep prefetching while expanded; only the visible leaf drives the line-change clock.
 */
export function CollapsedLyric({
  mediaState,
  lyricsSettings,
  active,
}: {
  mediaState: MediaState;
  lyricsSettings: LyricsSettings & { lyricsOffsetMs: number };
  active: boolean;
}) {
  const { lines } = useLyrics(mediaState, lyricsSettings);
  const [songOffsetMs] = useSongOffset(lines ? songOffsetKey(mediaState) : null);
  const offsetMs = lyricsSettings.lyricsOffsetMs + songOffsetMs;
  const { index, playing } = useLyricClock(lines, mediaState, offsetMs, active);
  const song = [mediaState.title, mediaState.artist].filter(Boolean).join(" · ");
  const line = lines && index >= 0 ? lines[index] : null;
  const words = lyricsSettings.lyricWordFill === true && line?.text ? line.words : undefined;
  const shownText = line?.text || song;
  const lyricRef = useRef<HTMLSpanElement>(null);

  // The island's width follows the longest line of the song, so the line on screen can still
  // be a shade too wide; shrink it a little then, instead of cutting the words off.
  useLayoutEffect(() => {
    if (lyricRef.current) fitLyric(lyricRef.current);
  }, [shownText]);

  return (
    <span className="collapsed-lyric" ref={lyricRef}>{words ? <CollapsedSungWords
      key={`${index}:${mediaState.updatedAt}:${offsetMs}:${active}:${playing}`}
      words={words} mediaState={mediaState} offsetMs={offsetMs} playing={playing && active}
    /> : shownText}</span>
  );
}
