import { useEffect, useState, useSyncExternalStore } from "react";
import { getUpdateState, subscribeToUpdate } from "./updaterController";
import { hasUnseenUpdate } from "./updateDot";
import { loadUpdateDotSeen, saveUpdateDotSeen, UPDATE_DOT_SEEN_EVENT, UPDATE_DOT_SEEN_KEY } from "./storage";

/** The header is also mounted while collapsed: only an actually open todo page marks it seen. */
export function useUpdateDot(viewingTodo: boolean): boolean {
  const [seen, setSeen] = useState(loadUpdateDotSeen);
  // Download byte progress should not re-render the header.
  const version = useSyncExternalStore(subscribeToUpdate, () => {
    const state = getUpdateState();
    return hasUnseenUpdate(state, seen) ? state.nextVersion : "";
  });
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
  return Boolean(version && !viewingTodo);
}
