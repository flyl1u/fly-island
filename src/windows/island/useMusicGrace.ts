import { useEffect, useRef, useState } from "react";
import { MUSIC_GRACE_MS, musicHolds } from "./musicGrace";

/** `playing`, held true for a short grace after it stops so gaps between tracks do not start idle tucking. */
export function useMusicGrace(playing: boolean): boolean {
  const lastPlayingAt = useRef<number | null>(null);
  const [, rerender] = useState(0);
  if (playing) lastPlayingAt.current = Date.now();
  useEffect(() => {
    if (playing || lastPlayingAt.current === null) return;
    const remaining = MUSIC_GRACE_MS - (Date.now() - lastPlayingAt.current);
    const timer = window.setTimeout(() => rerender((count) => count + 1), Math.max(0, remaining) + 50);
    return () => window.clearTimeout(timer);
  }, [playing]);
  return musicHolds(playing, lastPlayingAt.current, Date.now());
}
