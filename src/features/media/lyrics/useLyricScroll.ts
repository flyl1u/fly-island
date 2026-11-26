import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import type { MediaState } from "../api";
import type { LyricLine, LyricWord } from "./lrc";
import { LYRIC_LEAD_MS, lyricClockAt } from "./lyricClock";
import { lyricScrollFrames, planLyricScroll, planLyricWordScroll } from "./lyricScroll";

/** The view's width, followed so a resized island or a late font plans the travel again. */
function useViewWidth(view: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, fonts: 0 });
  useEffect(() => {
    const node = view.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setSize((value) => ({ ...value, width: node.clientWidth })));
    observer.observe(node);
    const fontsLoaded = () => setSize((value) => ({ ...value, fonts: value.fonts + 1 }));
    document.fonts.addEventListener("loadingdone", fontsLoaded);
    return () => { observer.disconnect(); document.fonts.removeEventListener("loadingdone", fontsLoaded); };
  }, [view]);
  return size;
}

function useReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const change = () => setReduced(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return reduced;
}

/**
 * Moves a lyric line too long for its view to the left while it is sung, leaving the layout alone.
 * The animation runs on the song's clock: it starts from the current position, holds while the
 * song is paused and is made again after a seek, so the island never re-renders for a frame.
 * With reduced motion, and for a line that fits, the line keeps its ellipsis.
 * `line` is null while the song's name stands in for the lyrics; that does not move.
 */
export function useLyricScroll(view: RefObject<HTMLSpanElement | null>, { line, next, words, mediaState, offsetMs, playing, active }: {
  line: LyricLine | null;
  next: LyricLine | null;
  words: LyricWord[] | undefined;
  mediaState: MediaState;
  offsetMs: number;
  playing: boolean;
  active: boolean;
}) {
  const size = useViewWidth(view);
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    const node = view.current;
    const track = node?.firstElementChild;
    if (!node || !(track instanceof HTMLElement) || !line?.text || !active || reduced || !node.clientWidth) return;
    // offsetWidth is the width before the island's scale; the line is still an inline run here.
    const distance = Math.ceil(track.offsetWidth - node.clientWidth);
    if (distance <= 1) return;
    const shownAtMs = line.timeMs - LYRIC_LEAD_MS;
    const spans = [...track.children] as HTMLElement[];
    const points = words && spans.length === words.length
      ? planLyricWordScroll({
        distance, view: node.clientWidth,
        words: words.map((word, index) => ({
          startMs: word.startMs, endMs: word.endMs, left: spans[index].offsetLeft - spans[0].offsetLeft, width: spans[index].offsetWidth,
        })),
      })
      : planLyricScroll({ distance, shownAtMs, goneAtMs: next ? next.timeMs - LYRIC_LEAD_MS : null });
    if (!points) return;
    const { startMs, durationMs, frames } = lyricScrollFrames(points, distance, shownAtMs);
    node.dataset.scrolling = "";
    const timing: KeyframeAnimationOptions = { duration: durationMs, fill: "both" };
    const animations = [
      track.animate(frames.map((frame) => ({ offset: frame.at, transform: `translateX(${-frame.offset}px)` })), timing),
      node.animate(frames.map((frame) => ({
        offset: frame.at, "--collapsed-lyric-fade-start": `${frame.fadeStart}px`, "--collapsed-lyric-fade-end": `${frame.fadeEnd}px`,
      })), timing),
    ];
    const elapsed = lyricClockAt(null, mediaState, Date.now(), offsetMs).position - startMs;
    for (const animation of animations) {
      if (!playing) animation.pause();
      animation.currentTime = elapsed;
    }
    return () => {
      for (const animation of animations) animation.cancel();
      delete node.dataset.scrolling;
    };
  }, [view, line, next, words, mediaState, offsetMs, playing, active, reduced, size]);
}
