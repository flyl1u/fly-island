import { useEffect, useState, useSyncExternalStore } from "react";
import { getUpdateState, subscribeToUpdate } from "./updaterController";
import { hasUnseenUpdate, updateDotVersion } from "./updateDot";
import { loadUpdateDotSeen, saveUpdateDotSeen, UPDATE_DOT_SEEN_EVENT, UPDATE_DOT_SEEN_KEY } from "./storage";

/**
 * The red dot on the island's todo button. It stays while an update waits to be installed, even on
 * the todo page and after it was viewed: the island usually opens on that page, so a dot cleared on
 * viewing was gone before anyone saw it. Viewing still records the version as seen.
 */
export function useUpdateDot(viewingTodo: boolean): boolean {
  const [seen, setSeen] = useState(loadUpdateDotSeen);
  // Download byte progress should not re-render the header.
  const version = useSyncExternalStore(subscribeToUpdate, () => {
    const state = getUpdateState();
    return hasUnseenUpdate(state, seen) ? state.nextVersion : "";
  });
  const pending = useSyncExternalStore(subscribeToUpdate, () => updateDotVersion(getUpdateState()) !== "");
  useEffect(() => {
    const reload = () => setSeen(loadUpdateDotSeen());
    const sync = (event: StorageEvent) => {
      if (event.key === UPDATE_DOT_SEEN_KEY || event.key === null) reload();
    };
    window.addEventListener("storage", sync);
    window.addEventListener(UPDATE_DOT_SEEN_EVENT, reload);
    reload();
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(UPDATE_DOT_SEEN_EVENT, reload);
    };
  }, []);
  useEffect(() => {
    if (!viewingTodo || !version || version === seen) return;
    saveUpdateDotSeen(version);
    // Still remember the visit for this window if persistent storage is unavailable.
    setSeen(version);
  }, [viewingTodo, version, seen]);
  return pending;
}
