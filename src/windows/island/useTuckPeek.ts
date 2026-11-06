import { useEffect, useState } from "react";
import { listenIslandHover } from "./api";
import { isEditingText } from "./useHoverExpand";

// Grace period before a peeking island slides back, so brushing past the edge or a
// cursor that slips off for a moment does not make it bounce.
const PEEK_RETRACT_DELAY_MS = 300;

/**
 * Slides a peeking island (minimized to the top edge) back once the cursor leaves it;
 * a panel opened from the peek closes with it, but not under a draft or a held button.
 */
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

  const [isPressing, setIsPressing] = useState(false);
  useEffect(() => {
    const press = () => setIsPressing(true);
    const release = () => setIsPressing(false);
    window.addEventListener("pointerdown", press, true);
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerdown", press, true);
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
      window.removeEventListener("blur", release);
    };
  }, []);

  useEffect(() => {
    if (!isPeeking || isHovering || isPressing) return;
    let timer: number | undefined;
    const retract = () => {
      if (isEditingText()) {
        timer = window.setTimeout(retract, Math.max(delayMs, 200));
        return;
      }
      onRetract();
    };
    timer = window.setTimeout(retract, delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, isHovering, isPeeking, isPressing, onRetract]);
}
