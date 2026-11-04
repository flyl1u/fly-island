import { useEffect, useRef } from "react";
import * as islandApi from "./api";
import "./ModifierWindowDrag.css";

/** Set on <html> while holding Ctrl over the island would move it; shows the move cursor. */
const MOVE_ARMED_CLASS = "island-move-armed";

/**
 * Ctrl + left-button drag moves the island from anywhere on its shape, collapsed or
 * expanded. The press is taken in the capture phase so buttons and inputs under the
 * cursor never see it.
 */
export function useModifierWindowDrag(onDragStart: () => void) {
  const isArmedRef = useRef(false);
  const onDragStartRef = useRef(onDragStart);

  useEffect(() => {
    onDragStartRef.current = onDragStart;
  }, [onDragStart]);

  useEffect(() => {
    let didCancel = false;
    let unlisten: (() => void) | null = null;

    void islandApi.listenIslandMoveArmed((armed) => {
      isArmedRef.current = armed;
      document.documentElement.classList.toggle(MOVE_ARMED_CLASS, armed);
    })
      .then((nextUnlisten) => {
        if (didCancel) {
          nextUnlisten();
        } else {
          unlisten = nextUnlisten;
        }
      })
      .catch((error) => {
        console.error("Failed to listen for island move modifier", error);
      });

    return () => {
      didCancel = true;
      unlisten?.();
      document.documentElement.classList.remove(MOVE_ARMED_CLASS);
    };
  }, []);

  useEffect(() => {
    let swallowNextClick = false;

    // Native polling is the reliable signal; ctrlKey covers a press that lands before
    // the first poll. Rust checks Ctrl again, so a stale value cannot move it.
    const press = (event: PointerEvent) => {
      swallowNextClick = false;
      if (event.button !== 0 || !(isArmedRef.current || event.ctrlKey)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      swallowNextClick = true;
      onDragStartRef.current();
    };
    const click = (event: MouseEvent) => {
      if (swallowNextClick && event.detail > 0) {
        swallowNextClick = false;
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("pointerdown", press, true);
    window.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("pointerdown", press, true);
      window.removeEventListener("click", click, true);
    };
  }, []);
}
