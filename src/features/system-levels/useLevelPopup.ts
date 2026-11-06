import { useEffect, useRef, useState } from "react";
import { listenLevelChanges, setLevelPopupEnabled, type LevelChange } from "./api";

/** How long the popup stays after the last change. */
export const LEVEL_POPUP_MS = 1500;

/**
 * The volume or brightness the collapsed island shows right after it changed, or null. `watch`
 * runs the native watcher (the setting is on); `show` says whether the island may show it now
 * (collapsed, not tucked away, not quiet for a game). Changes while it may not are dropped.
 */
export function useLevelPopup(watch: boolean, show: boolean): LevelChange | null {
  const [change, setChange] = useState<LevelChange | null>(null);
  const showRef = useRef(show);
  showRef.current = show;

  useEffect(() => {
    void setLevelPopupEnabled(watch).catch((error: unknown) =>
      console.error("Failed to switch the volume and brightness watcher", error),
    );
    if (!watch) {
      setChange(null);
      return;
    }
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listenLevelChanges((next) => {
      if (showRef.current) setChange(next);
    })
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch((error: unknown) => console.error("Failed to listen for volume and brightness changes", error));
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [watch]);

  useEffect(() => {
    if (!show) setChange(null);
  }, [show]);

  useEffect(() => {
    if (!change) return;
    const timer = window.setTimeout(() => setChange(null), LEVEL_POPUP_MS);
    return () => window.clearTimeout(timer);
  }, [change]);

  return change;
}
