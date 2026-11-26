import { useCallback, useSyncExternalStore } from "react";
import { countdownSeconds, nextCountdownDelay } from "../utils/countdown.ts";

/** A leaf countdown aligned to its absolute deadline, including after a hidden window resumes. */
export function useCountdown(deadline: number | null): number {
  const snapshot = useCallback(() => countdownSeconds(deadline, Date.now()), [deadline]);
  const subscribe = useCallback((notify: () => void) => {
    if (deadline === null) return () => {};
    let timer: number | undefined;
    let active = true;
    const tick = () => {
      if (!active) return;
      window.clearTimeout(timer);
      notify();
      const delay = nextCountdownDelay(deadline, Date.now());
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
  }, [deadline]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
