import { useEffect, useLayoutEffect, useRef } from "react";
import { listenIslandOutsideClick, setIslandOutsideClickWatch } from "./api";

function report(error: unknown) {
  console.error("Failed to watch for clicks outside the island", error);
}

/**
 * Calls `onOutsideClick` when the user presses a mouse button outside the island window, while
 * `watching`. The native side looks only while asked, so keep `watching` to the few seconds it is
 * needed (an alert showing).
 */
export function useOutsideClick(watching: boolean, onOutsideClick: () => void) {
  const handlerRef = useRef(onOutsideClick);
  useLayoutEffect(() => {
    handlerRef.current = onOutsideClick;
  });

  useEffect(() => {
    if (!watching) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listenIslandOutsideClick(() => handlerRef.current())
      .then((stop) => (cancelled ? stop() : (unlisten = stop)))
      .catch(report);
    void setIslandOutsideClickWatch(true).catch(report);
    return () => {
      cancelled = true;
      unlisten?.();
      void setIslandOutsideClickWatch(false).catch(report);
    };
  }, [watching]);
}
