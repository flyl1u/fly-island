import { useEffect, useState } from "react";
import { STORAGE_KEY, loadSettings, saveTranslationSettings, type TranslationSettings } from "./storage";

/**
 * Translation settings, saved on every change and kept in sync between the settings
 * window (where they are edited) and the translation window (where they are used).
 */
export function useTranslationSettings() {
  const [settings, setSettings] = useState<TranslationSettings>(loadSettings);

  // Writing back a value that came from the other window stores the same string, which
  // fires no further storage event, so the two windows do not echo each other.
  useEffect(() => { saveTranslationSettings(settings); }, [settings]);

  useEffect(() => {
    const syncFromOtherWindow = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setSettings(loadSettings());
    };
    window.addEventListener("storage", syncFromOtherWindow);
    return () => window.removeEventListener("storage", syncFromOtherWindow);
  }, []);

  return [settings, setSettings] as const;
}
