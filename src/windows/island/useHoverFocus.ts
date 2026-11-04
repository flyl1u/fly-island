import { useEffect, useRef, useState } from "react";
import { listenIslandHover, releaseIslandHoverFocus, takeIslandHoverFocus } from "./api";
import { HOVER_FOCUS_DWELL_MS, HOVER_FOCUS_RETRY_MS, hoverFocusAction } from "./hoverFocus";
import { isEditingText } from "./useHoverExpand";
import type { IslandMode } from "./types";

function logFocusError(error: unknown) {
  console.error("Failed to move focus for the island", error);
  return true;
}

/**
 * While the cursor rests on the expanded island, the island holds the keyboard focus,
 * so its shortcuts work even when it opened on hover with another app focused. The
 * focus goes back to that app when the cursor leaves or the island collapses; a text
 * field being edited keeps it until the island collapses. Rules in hoverFocus.ts.
 */
export function useHoverFocus(mode: IslandMode) {
  const [isHovering, setIsHovering] = useState(false);
  const holdingRef = useRef(false);

  useEffect(() => {
    let didCancel = false;
    let unlisten: (() => void) | null = null;
    void listenIslandHover(setIsHovering)
      .then((nextUnlisten) => {
        if (didCancel) nextUnlisten();
        else unlisten = nextUnlisten;
      })
      .catch(logFocusError);
    return () => {
      didCancel = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const action = hoverFocusAction({
      expanded: mode === "expanded",
      hovering: isHovering,
      holding: holdingRef.current,
      editing: isEditingText(),
    });
    if (action === "none") return;

    let cancelled = false;
    let timer: number | undefined;
    // The native side answers false while a mouse button is held (a drag in progress)
    // and the change waits until it is released.
    const run = (delayMs: number) => {
      timer = window.setTimeout(() => {
        // Set before the call, so a leave during it still hands the focus back.
        holdingRef.current = action === "take";
        const call = action === "take" ? takeIslandHoverFocus() : releaseIslandHoverFocus();
        void call.catch(logFocusError).then((settled) => {
          if (!settled && !cancelled) run(HOVER_FOCUS_RETRY_MS);
        });
      }, delayMs);
    };
    run(action === "take" ? HOVER_FOCUS_DWELL_MS : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isHovering, mode]);
}
