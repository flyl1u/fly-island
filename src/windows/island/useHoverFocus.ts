import { useEffect, useRef, useState } from "react";
import { listenIslandHover, releaseIslandHoverFocus, takeIslandHoverFocus } from "./api";
import { isEditingText } from "./useHoverExpand";
import type { IslandMode } from "./types";

function logFocusError(error: unknown) {
  console.error("Failed to move focus for the island", error);
}

/**
 * While the cursor is over the expanded island, the island holds the keyboard focus,
 * so its shortcuts work even when it opened on hover with another app focused. The
 * focus goes back to that app when the cursor leaves or the island collapses; a text
 * field being edited keeps it until the island collapses.
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
    if (mode === "expanded" && isHovering) {
      holdingRef.current = true;
      void takeIslandHoverFocus().catch(logFocusError);
      return;
    }
    if (!holdingRef.current || (mode === "expanded" && isEditingText())) return;
    holdingRef.current = false;
    void releaseIslandHoverFocus().catch(logFocusError);
  }, [isHovering, mode]);
}
