import { useEffect, useRef, useState } from "react";

/** The shape's width animation (IslandShell.css `.island--width-motion`). */
export const WIDTH_MOTION_MS = 400;
/** A narrower width waits this long, so the text swaps first and quick changes settle (B3-3). */
export const SHRINK_DELAY_MS = 300;

/**
 * Smooths the collapsed width: a wider target applies at once (the island widens before the new
 * text shows); a narrower one after SHRINK_DELAY_MS, and only if nothing wider came meanwhile.
 * `moving` is true for the animation after a change made while collapsed (never for opening or
 * closing, which have their own spring); `hitWidth` is what the native hit test should use: it
 * grows with the target and shrinks only after the animation has ended.
 */
export function useCollapsedWidthMotion(target: number, collapsed: boolean) {
  const [width, setWidth] = useState(target);
  const [moving, setMoving] = useState(false);
  const [hitWidth, setHitWidth] = useState(target);
  const previous = useRef({ width: target, collapsed });

  useEffect(() => {
    if (target >= width) { if (target !== width) setWidth(target); return; }
    const timer = window.setTimeout(() => setWidth(target), SHRINK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [target, width]);

  useEffect(() => {
    const before = previous.current;
    previous.current = { width, collapsed };
    if (collapsed && before.collapsed && before.width !== width) setMoving(true);
  }, [width, collapsed]);

  useEffect(() => {
    if (!moving) return;
    const timer = window.setTimeout(() => setMoving(false), WIDTH_MOTION_MS + 50);
    return () => window.clearTimeout(timer);
  }, [moving, width]);

  useEffect(() => {
    if (width >= hitWidth) { if (width !== hitWidth) setHitWidth(width); return; }
    const timer = window.setTimeout(() => setHitWidth(width), WIDTH_MOTION_MS + 50);
    return () => window.clearTimeout(timer);
  }, [width, hitWidth]);

  return { width, moving, hitWidth };
}
