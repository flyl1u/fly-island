import { useEffect, useRef, useState } from "react";
import { listenIslandHover } from "./api";
import type { IslandMode } from "./types";

// Controls on the collapsed island that act on their own (message preview, mail,
// music). Resting on them must not open the panel over them.
const OWN_ACTION_SELECTOR = ".island__collapsed button:not(.island__open-button):hover";

type HoverExpandOptions = {
  enabled: boolean;
  delayMs: number;
  /** How long the panel stays open after the cursor leaves it. */
  collapseDelayMs: number;
  mode: IslandMode;
  isTucked: boolean;
  onExpand: () => void;
  onCollapse: () => void;
};

// Typing goes into a focused text field; closing the panel under it would lose the draft.
function isEditingText() {
  const element = document.activeElement;
  return (
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement && !["button", "checkbox", "radio", "range", "submit"].includes(element.type)) ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
}

/**
 * Hover mode: opens the island when the cursor rests on it, and closes the panel once
 * the cursor has been over it and leaves, however it was opened and whatever was
 * clicked inside. It stays open while a text field has focus or a button is held (a
 * drag that left the panel), and closes when that ends. A panel the cursor never
 * entered (opened by a shortcut or a settings preview) is left to its own closing.
 * Pressing cancels a pending open, so drags and clicks on the collapsed island work,
 * and hovering never takes focus from the app the user is typing in.
 */
export function useHoverExpand({ enabled, delayMs, collapseDelayMs, mode, isTucked, onExpand, onCollapse }: HoverExpandOptions) {
  const [isHovering, setIsHovering] = useState(false);
  const isHoveringRef = useRef(false);
  const modeRef = useRef(mode);
  // False once the island opened or closed under a resting cursor; the cursor has to
  // leave and come back before hovering opens it again.
  const armedRef = useRef(true);
  // The cursor has been over the expanded panel since it opened.
  const enteredRef = useRef(false);
  const pressingRef = useRef(false);
  const expandTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    let didCancel = false;
    let unlisten: (() => void) | null = null;

    void listenIslandHover((inside) => {
      isHoveringRef.current = inside;
      if (inside && modeRef.current === "expanded") enteredRef.current = true;
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
      pressingRef.current = true;
    };
    const release = () => {
      pressingRef.current = false;
    };

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
    modeRef.current = mode;
    if (mode === "collapsed") {
      enteredRef.current = false;
      if (isHoveringRef.current) armedRef.current = false;
    } else if (isHoveringRef.current) {
      enteredRef.current = true;
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
      onExpand();
    };

    expandTimerRef.current = window.setTimeout(open, delayMs);
    return () => window.clearTimeout(expandTimerRef.current);
  }, [delayMs, enabled, isHovering, isTucked, mode, onExpand]);

  useEffect(() => {
    if (!enabled || isHovering || mode !== "expanded" || !enteredRef.current) {
      return;
    }

    let timer: number | undefined;
    const close = () => {
      // Check again later rather than closing under a draft or a held drag.
      if (pressingRef.current || isEditingText()) {
        timer = window.setTimeout(close, Math.max(collapseDelayMs, 200));
        return;
      }
      onCollapse();
    };

    timer = window.setTimeout(close, collapseDelayMs);
    return () => window.clearTimeout(timer);
  }, [collapseDelayMs, enabled, isHovering, mode, onCollapse]);
}
