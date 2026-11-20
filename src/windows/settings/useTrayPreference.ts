import { useCallback, useEffect, useState } from "react";
import { listenTrayVisibilityChanged, setTrayVisible } from "./api";
import { loadTrayVisible, saveTrayVisible, TRAY_VISIBLE_CHANGED_EVENT, TRAY_VISIBLE_STORAGE_KEY } from "./storage";

/** Native changes and other windows share the saved choice; failed changes stay reviewable. */
export function useTrayPreference() {
  const [visible, setVisible] = useState(loadTrayVisible);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"storage" | { reason: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    const sync = () => setVisible(loadTrayVisible());
    const onStorage = (event: StorageEvent) => {
      if (event.key === TRAY_VISIBLE_STORAGE_KEY || event.key === null) sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(TRAY_VISIBLE_CHANGED_EVENT, sync);
    void listenTrayVisibilityChanged((next) => {
      if (cancelled) return;
      setVisible(next);
      if (!saveTrayVisible(next)) setError("storage");
    }).then((stop) => {
      if (cancelled) stop();
      else unlisten = stop;
    }).catch((reason) => console.error("Failed to listen for tray preference", reason));
    return () => {
      cancelled = true;
      unlisten?.();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(TRAY_VISIBLE_CHANGED_EVENT, sync);
    };
  }, []);

  const update = useCallback(async (next: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await setTrayVisible(next);
      setVisible(next);
      if (!saveTrayVisible(next)) setError("storage");
    } catch (reason) {
      setError({ reason: String(reason) });
    } finally { setBusy(false); }
  }, []);
  return { visible, busy, error, update };
}
