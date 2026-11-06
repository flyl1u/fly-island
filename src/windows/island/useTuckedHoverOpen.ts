import { useCallback, useEffect, useRef } from "react";
import { listenIslandHover } from "./api";

// The tucked island sits on the screen's top edge, where the cursor often passes on
// its way to tabs and menus: it slides out at once, but opens only if the cursor stays.
// It opens no sooner than the slide-out ends (POSITION_ANIMATION_DURATION in
// src-tauri/src/island/geometry.rs), so the two play one after the other.
const MIN_OPEN_DELAY_MS = 320;

type TuckedHoverOptions = {
  /** Hovering a tucked island opens its panel (setting "展开面板"); otherwise it only slides out. */
  opensPanel: boolean;
  delayMs: number;
  /** Slides the island out under the cursor (useIslandNavigation's peekIsland). */
  onPeek: () => void;
  /** Opens the current page. */
  onOpen: () => void;
  /** The island was tucked so that it slides back once the cursor leaves. */
  retractsAfterPeek: boolean;
  /** Keeps that after opening, so the panel closes and the island slides back with it. */
  resumePeek: () => void;
};

/** What the cursor arriving on a tucked island does; returns the handler for that moment. */
export function useTuckedHoverOpen({ opensPanel, delayMs, onPeek, onOpen, retractsAfterPeek, resumePeek }: TuckedHoverOptions) {
  const hoveringRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    let didCancel = false;
    let unlisten: (() => void) | null = null;
    void listenIslandHover((inside) => {
      hoveringRef.current = inside;
      if (!inside) window.clearTimeout(timerRef.current);
    })
      .then((next) => {
        if (didCancel) next();
        else unlisten = next;
      })
      .catch((error) => console.error("Failed to listen for island hover", error));
    return () => {
      didCancel = true;
      unlisten?.();
      window.clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback(() => {
    onPeek();
    if (!opensPanel) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      // The page sees the cursor before the native hover event arrives.
      if (!hoveringRef.current && !document.querySelector(".island:hover")) return;
      onOpen();
      if (retractsAfterPeek) resumePeek();
    }, Math.max(delayMs, MIN_OPEN_DELAY_MS));
  }, [delayMs, onOpen, onPeek, opensPanel, resumePeek, retractsAfterPeek]);
}
