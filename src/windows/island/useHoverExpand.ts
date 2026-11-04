import { useEffect, useRef, useState } from "react";
import { listenIslandHover } from "./api";
import type { IslandMode } from "./types";

// Controls on the collapsed island that act on their own (message preview, mail,
// music). Resting on them must not open the panel over them.
const OWN_ACTION_SELECTOR = ".island__collapsed button:not(.island__open-button):hover";

type HoverExpandOptions = {
  enabled: boolean;
  delayMs: number;
  /** How long a panel opened by hovering stays open after the cursor leaves it. */
  collapseDelayMs: number;
  mode: IslandMode;
  isTucked: boolean;
  onExpand: () => void;
  onCollapse: () => void;
};

/**
 * Opens the island when the cursor rests on it, and closes a panel opened that way
 * once the cursor leaves. Pressing inside the island keeps the panel open (it then
 * closes on blur like a clicked one) and cancels a pending open, so drags and clicks
 * still work. Hovering does not take focus from the app the user is typing in.
 */
export function useHoverExpand({ enabled, delayMs, collapseDelayMs, mode, isTucked, onExpand, onCollapse }: HoverExpandOptions) {
  const [isHovering, setIsHovering] = useState(false);
  const isHoveringRef = useRef(false);
  // False once the island opened or closed under a resting cursor; the cursor has to
  // leave and come back before hovering opens it again.
  const armedRef = useRef(true);
  const openedByHoverRef = useRef(false);
  const expandTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    let didCancel = false;
    let unlisten: (() => void) | null = null;

    void listenIslandHover((inside) => {
      isHoveringRef.current = inside;
      if (!inside) armedRef.current = true;
      setIsHovering(inside);
    })
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
    const press = () => {
      window.clearTimeout(expandTimerRef.current);
      armedRef.current = false;
      openedByHoverRef.current = false;
    };

    window.addEventListener("pointerdown", press, true);
    return () => window.removeEventListener("pointerdown", press, true);
  }, []);

  useEffect(() => {
    if (mode === "collapsed") {
      openedByHoverRef.current = false;
      if (isHoveringRef.current) armedRef.current = false;
    }
  }, [mode]);

  useEffect(() => {
    if (!enabled || !isHovering || mode !== "collapsed" || isTucked || !armedRef.current) {
      return;
    }

    const open = () => {
      if (document.querySelector(OWN_ACTION_SELECTOR)) {
        expandTimerRef.current = window.setTimeout(open, Math.max(delayMs, 100));
        return;
      }
      armedRef.current = false;
      openedByHoverRef.current = true;
      onExpand();
    };

    expandTimerRef.current = window.setTimeout(open, delayMs);
    return () => window.clearTimeout(expandTimerRef.current);
  }, [delayMs, enabled, isHovering, isTucked, mode, onExpand]);

  useEffect(() => {
    if (!enabled || isHovering || mode !== "expanded" || !openedByHoverRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      openedByHoverRef.current = false;
      onCollapse();
    }, collapseDelayMs);
    return () => window.clearTimeout(timer);
  }, [collapseDelayMs, enabled, isHovering, mode, onCollapse]);
}
