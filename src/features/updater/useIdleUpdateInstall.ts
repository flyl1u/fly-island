import { useEffect, useSyncExternalStore } from "react";
import { IDLE_INSTALL_MS } from "./autoUpdateSchedule.ts";
import { getUpdateState, installUpdate, subscribeToUpdate } from "./updaterController";

// The island only sees the pointer while it is over the island shape (the rest of
// the stage passes clicks through), so these mean "someone is using the island".
const ACTIVITY_EVENTS = ["pointermove", "pointerdown", "keydown", "wheel"] as const;

/**
 * With automatic updates on, installs a downloaded update once the island has been
 * collapsed and untouched for two minutes; the installer then restarts the island.
 * Opening the panel, hovering or typing starts the wait over. `paused` (game mode)
 * holds it off entirely.
 */
export function useIdleUpdateInstall(collapsed: boolean, paused: boolean) {
  const { stage, autoUpdate } = useSyncExternalStore(subscribeToUpdate, getUpdateState);
  const armed = autoUpdate && stage === "ready" && collapsed && !paused;

  useEffect(() => {
    if (!armed) return;
    const install = () => void installUpdate();
    let timer = setTimeout(install, IDLE_INSTALL_MS);
    const restart = () => {
      clearTimeout(timer);
      timer = setTimeout(install, IDLE_INSTALL_MS);
    };
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, restart, { passive: true });
    return () => {
      clearTimeout(timer);
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, restart);
    };
  }, [armed]);
}
