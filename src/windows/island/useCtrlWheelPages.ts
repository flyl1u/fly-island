import { useEffect, useRef } from "react";
import type { IslandMode, IslandPage } from "./types";
import { nextWheelPage } from "./wheelPages";

export { wheelPageOrder } from "./wheelPages";

/** One page per notch; a free-spinning wheel or a touchpad flick still moves one page at a time. */
const WHEEL_STEP_MS = 220;

type CtrlWheelOptions = {
  enabled: boolean;
  mode: IslandMode;
  page: IslandPage;
  pages: IslandPage[];
  onPageChange: (page: IslandPage) => void;
};

/**
 * Ctrl + mouse wheel over the expanded island switches its page (setting, off by default).
 * Without Ctrl, or on the collapsed island, the wheel is left alone: lists keep scrolling and
 * the webview's own Ctrl + wheel zoom is held back only while this is on and expanded.
 */
export function useCtrlWheelPages(options: CtrlWheelOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const lastStepRef = useRef(0);

  useEffect(() => {
    if (!options.enabled) return;
    const handleWheel = (event: WheelEvent) => {
      const { mode, page, pages, onPageChange } = optionsRef.current;
      if (mode !== "expanded" || !event.ctrlKey) return;
      event.preventDefault();
      if (event.deltaY === 0) return;
      const now = performance.now();
      if (now - lastStepRef.current < WHEEL_STEP_MS) return;
      lastStepRef.current = now;
      const next = nextWheelPage(pages, page, event.deltaY > 0 ? 1 : -1);
      if (next) onPageChange(next);
    };
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [options.enabled]);
}
