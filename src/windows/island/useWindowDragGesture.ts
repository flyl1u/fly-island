import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";

/**
 * Starts a native window drag once the primary pointer moves 3px from where
 * it was pressed; `didDragRef` lets the following click be ignored.
 */
export function useWindowDragGesture(disabled: boolean, onWindowDragStart: () => void) {
  const didDragRef = useRef(false);
  const windowDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);

  const prepareWindowDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      didDragRef.current = false;
      windowDragRef.current = null;
      if (event.button !== 0 || disabled) {
        return;
      }

      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          "button:not(.island__open-button), input, textarea, select, a, [contenteditable='true'], [data-window-drag='false']",
        )
      ) {
        return;
      }

      windowDragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [disabled],
  );

  const handleWindowDragMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = windowDragRef.current;
      if (disabled) {
        windowDragRef.current = null;
        return;
      }
      if (!drag || drag.pointerId !== event.pointerId || event.buttons !== 1) {
        return;
      }

      if (
        Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 3
      ) {
        return;
      }

      windowDragRef.current = null;
      didDragRef.current = true;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      event.preventDefault();
      onWindowDragStart();
    },
    [disabled, onWindowDragStart],
  );

  const cancelWindowDrag = useCallback(() => {
    windowDragRef.current = null;
  }, []);

  return { didDragRef, prepareWindowDrag, handleWindowDragMove, cancelWindowDrag };
}
