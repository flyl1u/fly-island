import { useEffect, useLayoutEffect, useState } from "react";

/** Retain a cleared list just long enough to play the card's existing motion in reverse. */
export function useMessageCardExit<T>(items: T[], enabled: boolean) {
  const [retained, setRetained] = useState(items);
  const leaving = enabled && items.length === 0 && retained.length > 0;
  useLayoutEffect(() => {
    if (!enabled || items.length > 0) setRetained(items);
  }, [items, enabled]);
  useEffect(() => {
    if (!leaving) return;
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180;
    const timer = window.setTimeout(() => setRetained([]), delay);
    return () => window.clearTimeout(timer);
  }, [leaving]);
  return { items: items.length > 0 || !enabled ? items : retained, leaving };
}
