import { useEffect, useState } from "react";
import { listenIslandHover } from "./api";

// Grace period before a peeking island slides back, so brushing past the edge or a
// cursor that slips off for a moment does not make it bounce.
const PEEK_RETRACT_DELAY_MS = 300;

/** Slides a peeking island (minimized to the top edge) back once the cursor leaves it. */
export function useTuckPeek(isPeeking: boolean, onRetract: () => void, delayMs: number = PEEK_RETRACT_DELAY_MS) {
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    let didCancel = false;
    let unlisten: (() => void) | null = null;

    void listenIslandHover(setIsHovering)
      .then((nextUnlisten) => {
        if (didCancel) nextUnlisten();
        else unlisten = nextUnlisten;
      })
      .catch((error) => {
        console.error("Failed to listen for island hover", error);
      });

    return () => {
      didCancel = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!isPeeking || isHovering) return;
    const timer = window.setTimeout(onRetract, delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, isHovering, isPeeking, onRetract]);
}
