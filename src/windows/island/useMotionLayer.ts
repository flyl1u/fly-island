import { useLayoutEffect, useRef } from "react";
import { noteIslandMotion } from "../../lib/islandMotion";
import type { IslandMode, IslandPage } from "./types";

// The longest shape transition (opening, 560ms in IslandShell.css) and a few frames to spare.
const MOTION_LAYER_MS = 640;

/**
 * Gives the page panel a layer of its own (will-change) while the island changes shape: when it
 * opens or closes, and when the open page or its height changes. On its own layer the panel is
 * drawn once and then only moved, faded and clipped as the shape animates; drawn into the
 * island's layer it was drawn again on every frame, the page's text, rings and covers included.
 * The layer goes once the shape has settled, so the text is drawn straight onto the island again.
 * Set on the element itself rather than through state, so a motion costs no extra render.
 */
export function useMotionLayer<T extends HTMLElement>(mode: IslandMode, page: IslandPage, height: number) {
  const ref = useRef<T>(null);
  const isFirst = useRef(true);

  useLayoutEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    noteIslandMotion(MOTION_LAYER_MS);
    const element = ref.current;
    if (!element) return;
    element.style.willChange = "transform, opacity";
    const timer = window.setTimeout(() => {
      element.style.willChange = "";
    }, MOTION_LAYER_MS);
    return () => window.clearTimeout(timer);
  }, [mode, page, height]);

  return ref;
}
