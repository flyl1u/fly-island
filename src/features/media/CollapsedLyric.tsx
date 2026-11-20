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
 * How far the line may shrink. The island's font scale makes the text wider, so the floor
 * follows it: the font never gets smaller than it would at the default island size.
 */
function fitFloor(element: HTMLElement) {
  const scale = Number.parseFloat(getComputedStyle(element).getPropertyValue("--island-font-scale")) || 1;
  return Math.min(MIN_LYRIC_FIT, MIN_LYRIC_FIT / scale);
}

/**
 * Shrink the line's font until the whole line fits the room it has. The width a line needs
 * follows its font size, so the width it has now says how wide the line would be without any
 * shrinking.
 */
function fitLyric(element: HTMLElement) {
  const available = element.clientWidth;
  const fit = Number(element.style.getPropertyValue("--lyric-fit")) || 1;
  if (available <= 0) return;
  const needed = element.scrollWidth;
  if (needed <= available) {
    // The line fits as it is; it may still carry the shrink of an earlier, longer line.
    if (fit < 1 && needed / fit <= available) {
      element.style.setProperty("--lyric-fit", "1");
    }
    return;
  }
  // A pixel of slack keeps the rounded text width from asking for another round.
  const next = Math.max(fitFloor(element), fit * (available - 1) / needed);
  element.style.setProperty("--lyric-fit", String(next));
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
    const element = lyricRef.current;
    if (!element) return;
    element.style.setProperty("--lyric-fit", "1");
    fitLyric(element);
  }, [shownText]);

  // The island's font size and its width can change under the line (Settings → Appearance, a
  // window resize), so the fit is measured again whenever the line's own box changes.
  useLayoutEffect(() => {
    const element = lyricRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => fitLyric(element));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <span className="collapsed-lyric" ref={lyricRef}>{words ? <CollapsedSungWords
      key={`${index}:${mediaState.updatedAt}:${offsetMs}:${active}:${playing}`}
      words={words} mediaState={mediaState} offsetMs={offsetMs} playing={playing && active}
    /> : shownText}</span>
  );
}
