import { useEffect, useState } from "react";
import { DETACHED_SETTINGS_STORAGE_KEY, SETTINGS_PRESENTATION_CHANGED, loadDetachedSettings } from "./storage";

export function useSettingsPresentation() {
  const [detached, setDetached] = useState(loadDetachedSettings);
  useEffect(() => {
    const sync = () => setDetached(loadDetachedSettings());
    const onStorage = (event: StorageEvent) => {
      if (event.key === DETACHED_SETTINGS_STORAGE_KEY || event.key === null) sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(SETTINGS_PRESENTATION_CHANGED, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SETTINGS_PRESENTATION_CHANGED, sync);
    };
  }, []);
  return detached;
}
