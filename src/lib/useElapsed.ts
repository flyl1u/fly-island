import { useCallback, useSyncExternalStore } from "react";
import { elapsedSeconds, nextElapsedDelay } from "../utils/countdown";

/** A leaf running total since `from`, aligned to whole seconds like `useCountdown`. */
export function useElapsed(from: number | null): number {
  const snapshot = useCallback(() => elapsedSeconds(from, Date.now()), [from]);
  const subscribe = useCallback((notify: () => void) => {
    if (from === null) return () => {};
    let timer: number | undefined;
    let active = true;
    const tick = () => {
      if (!active) return;
      window.clearTimeout(timer);
      notify();
      const delay = nextElapsedDelay(from, Date.now());
      if (active && delay !== null && document.visibilityState !== "hidden") {
        timer = window.setTimeout(tick, delay);
      }
    };
    tick();
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [from]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
