import { useLayoutEffect, useRef } from "react";
import type { IslandMode, IslandPage } from "./types";

// Short enough to finish well inside the 560ms height spring it plays alongside (IslandShell.css).
const FADE_IN_DURATION_MS = 220;

/**
 * Fades the expanded content in when the open page changes, so the new page does not
 * pop in while the island is still resizing. Uses the Web Animations API instead of
 * remounting with a key, so the pages keep their state.
 */
export function usePageFadeIn<T extends HTMLElement>(page: IslandPage, mode: IslandMode) {
  const contentRef = useRef<T>(null);
  const previousPageRef = useRef(page);

  useLayoutEffect(() => {
    const previousPage = previousPageRef.current;
    previousPageRef.current = page;
    const content = contentRef.current;
    if (
      previousPage === page ||
      mode !== "expanded" ||
      !content ||
      typeof content.animate !== "function"
    ) {
      return;
    }

    const animation = content.animate(
      [
        { opacity: 0, transform: "translateY(6px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: FADE_IN_DURATION_MS, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
    return () => animation.cancel();
  }, [mode, page]);

  return contentRef;
}
