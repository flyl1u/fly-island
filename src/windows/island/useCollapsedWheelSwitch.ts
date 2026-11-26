import { useEffect, useRef, type RefObject } from "react";
import { feedWheelGesture, IDLE_WHEEL_GESTURE } from "./collapsedWheel";

/** One line of a line-mode wheel delta, in px. */
const WHEEL_LINE_PX = 16;

/**
 * Scrolling over the collapsed island switches what its text shows. The listener is added by hand:
 * React's onWheel is passive and could not keep the scroll from reaching the page. `onSwitch` is
 * null whenever the wheel is not ours (open, tucked, or a message or alert in the text's place).
 * Nothing here opens or focuses the island.
 */
export function useCollapsedWheelSwitch(
  islandRef: RefObject<HTMLElement | null>,
  onSwitch: ((direction: 1 | -1) => void) | null,
) {
  const switchRef = useRef(onSwitch);
  switchRef.current = onSwitch;
  const gestureRef = useRef(IDLE_WHEEL_GESTURE);

  useEffect(() => {
    const island = islandRef.current;
    if (!island) return;
    const handleWheel = (event: WheelEvent) => {
      // Ctrl + wheel belongs to the webview's zoom and the open island's page switch.
      if (!switchRef.current || event.ctrlKey) return;
      event.preventDefault();
      const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * WHEEL_LINE_PX : event.deltaY;
      const { gesture, step } = feedWheelGesture(gestureRef.current, delta, performance.now());
      gestureRef.current = gesture;
      if (step !== 0) switchRef.current(step);
    };
    island.addEventListener("wheel", handleWheel, { passive: false });
    return () => island.removeEventListener("wheel", handleWheel);
  }, [islandRef]);
}
