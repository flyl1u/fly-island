import { useEffect, useState } from "react";
import { DETACHED_SETTINGS_CHANGED_EVENT, DETACHED_SETTINGS_STORAGE_KEY, loadDetachedSettings } from "./storage";

/** Whether settings open in their own window, following changes from either window. */
export function useSettingsPresentation() {
  const [detached, setDetached] = useState(loadDetachedSettings);
  useEffect(() => {
    const reload = () => setDetached(loadDetachedSettings());
    const sync = (event: StorageEvent) => {
      if (event.key === DETACHED_SETTINGS_STORAGE_KEY || event.key === null) reload();
    };
    window.addEventListener("storage", sync);
    window.addEventListener(DETACHED_SETTINGS_CHANGED_EVENT, reload);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(DETACHED_SETTINGS_CHANGED_EVENT, reload);
    };
  }, []);
  return detached;
}
