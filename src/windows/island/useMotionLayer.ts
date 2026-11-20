import { useEffect, useLayoutEffect, useRef } from "react";
import { noteIslandMotion } from "../../lib/islandMotion";
import type { IslandMode, IslandPage } from "./types";

// The longest shape transition (opening, 560ms in IslandShell.css) and a few frames to spare.
const MOTION_LAYER_MS = 640;

/**
 * Gives the page panel a layer of its own (will-change) while the island changes shape: when it
 * opens or closes (not between pages, see below). On its own layer the panel is
 * drawn once and then only moved, faded and clipped as the shape animates; drawn into the
 * island's layer it was drawn again on every frame, the page's text, rings and covers included.
 * The layer goes once the shape has settled, so the text is drawn straight onto the island again.
 * Set on the element itself rather than through state, so a motion costs no extra render.
 */
export function useMotionLayer<T extends HTMLElement>(mode: IslandMode, page: IslandPage, height: number) {
  const ref = useRef<T>(null);
  const isFirst = useRef(true);
  const lastMode = useRef(mode);
  // Kept across re-runs: a height change mid-motion re-runs the effect without a mode change, and
  // clearing the timer there left the layer (and data-moving) on for good.
  const timer = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    noteIslandMotion(MOTION_LAYER_MS);
    const modeChanged = lastMode.current !== mode;
    lastMode.current = mode;
    // Between pages the new page is meant to be read at once. On a layer of its own its text is
    // drawn without subpixel antialiasing (the layer has no opaque background) and turns sharp
    // only when the layer goes, 640ms later: the page read as blurred, then clear (2026-11-18,
    // owner). So only opening and closing, where the panel fades anyway, get the layer.
    if (!modeChanged) return;
    const element = ref.current;
    if (!element) return;
    // data-moving: the glass rim waits for the shape to settle (IslandGlass.css).
    const island = element.closest<HTMLElement>(".island");
    element.style.willChange = "transform, opacity";
    island?.setAttribute("data-moving", "");
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      element.style.willChange = "";
      island?.removeAttribute("data-moving");
    }, MOTION_LAYER_MS);
  }, [mode, page, height]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  return ref;
}
