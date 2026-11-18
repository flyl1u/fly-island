import { useEffect, useRef, useState } from "react";
import { listenIslandHover, releaseIslandHoverFocus, takeIslandHoverFocus } from "./api";
import { HOVER_FOCUS_DWELL_MS, HOVER_FOCUS_RELEASE_MIN_MS, HOVER_FOCUS_RETRY_MS, hoverFocusAction } from "./hoverFocus";
import { isEditingText } from "./useHoverExpand";
import type { IslandMode } from "./types";
import { isIslandPickerOpen } from "../../lib/islandPicker";

/**
 * Text selected in the message reader while the island has the focus (a message being copied).
 * Once another app is clicked the island loses the focus and the selection stops counting.
 */
export function hasIslandSelection() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !document.hasFocus()) return false;
  const node = selection.anchorNode;
  const element = node instanceof Element ? node : node?.parentElement;
  return Boolean(element?.closest(".message-notice") && selection.toString().trim());
}

function logFocusError(error: unknown) {
  console.error("Failed to move focus for the island", error);
  return true;
}

/**
 * While the cursor rests on the expanded island, the island holds the keyboard focus,
 * so its shortcuts work even when it opened on hover with another app focused. The
 * focus goes back to that app when the cursor leaves or the island collapses; a text
 * field being edited keeps it until the island collapses or the field loses focus.
 * `blocked` (game mode) stops it taking the focus. Rules in hoverFocus.ts.
 *
 * Leaving the panel hands the focus back only after `releaseDelayMs` (the hover close delay):
 * the island closes as soon as it loses the focus, so handing it back at once turned every
 * brush past the panel's edge into an instant close, ahead of the close delay.
 */
export function useHoverFocus(mode: IslandMode, blocked: boolean, pickerOpen = false, releaseDelayMs = 0) {
  const [isHovering, setIsHovering] = useState(false);
  const [entered, setEntered] = useState(false);
  const stateRef = useRef({ mode, isHovering, entered });
  useEffect(() => {
    stateRef.current = { mode, isHovering, entered };
  }, [entered, isHovering, mode]);
  useEffect(() => {
    if (mode !== "expanded") setEntered(false);
    else if (isHovering) setEntered(true);
  }, [isHovering, mode]);

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
    if (mode === "expanded" && pickerOpen) return;
    const action = hoverFocusAction({
      expanded: mode === "expanded",
      hovering: isHovering,
      entered: entered || isHovering,
      editing: isEditingText(),
      blocked,
      reading: document.querySelector(".message-notice") !== null,
      selecting: hasIslandSelection(),
    });
    if (action === "none") return;

    let cancelled = false;
    let timer: number | undefined;
    // The native side answers false while a mouse button is held (a drag in progress)
    // and the change waits until it is released.
    const run = (delayMs: number) => {
      timer = window.setTimeout(() => {
        if (mode === "expanded" && isIslandPickerOpen()) return;
        const call = action === "take" ? takeIslandHoverFocus() : releaseIslandHoverFocus();
        void call.catch(logFocusError).then((settled) => {
          if (!settled && !cancelled) run(HOVER_FOCUS_RETRY_MS);
        });
      }, delayMs);
    };
    run(action === "take"
      ? HOVER_FOCUS_DWELL_MS
      : mode === "expanded" ? Math.max(releaseDelayMs, HOVER_FOCUS_RELEASE_MIN_MS) : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [blocked, entered, isHovering, mode, pickerOpen, releaseDelayMs]);

  // A draft kept the focus when the cursor left; once its field loses focus while the
  // cursor is still away, hand the focus back without waiting for the island to close.
  useEffect(() => {
    const handleFocusOut = () => {
      window.setTimeout(() => {
        const { mode: currentMode, isHovering: hovering, entered: wasEntered } = stateRef.current;
        if (currentMode === "expanded" && wasEntered && !hovering && !isEditingText() && !isIslandPickerOpen()) {
          void releaseIslandHoverFocus().catch(logFocusError);
        }
      }, 0);
    };
    window.addEventListener("focusout", handleFocusOut);
    return () => window.removeEventListener("focusout", handleFocusOut);
  }, []);
}
