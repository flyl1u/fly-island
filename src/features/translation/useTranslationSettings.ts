import { useEffect, useState } from "react";
import { STORAGE_KEY, loadSettings, saveTranslationSettings, type TranslationSettings } from "./storage";

/**
 * Told to the other copies in this window when one copy saves a change. One window can
 * hold several copies (the Translation settings page has one for the service section
 * and one for the shortcut row), and each saves the whole object, so a copy that missed
 * an edit would write the old value back: changing the model used to undo a new shortcut.
 * `storage` events only reach other windows.
 */
const SAVED_IN_THIS_WINDOW = "focusd-island-translation-settings-saved";

/**
 * Translation settings, saved on every change and kept in sync between the settings
 * window (where they are edited), the translation window (where they are used) and
 * the copies inside one window.
 */
export function useTranslationSettings() {
  const [settings, setSettings] = useState<TranslationSettings>(loadSettings);

  // Writing back a value that came from another copy stores the same string, which
  // announces nothing further, so the copies do not echo each other.
  useEffect(() => {
    const before = localStorage.getItem(STORAGE_KEY);
    saveTranslationSettings(settings);
    if (localStorage.getItem(STORAGE_KEY) !== before) window.dispatchEvent(new Event(SAVED_IN_THIS_WINDOW));
  }, [settings]);

  useEffect(() => {
    const reload = () => setSettings(loadSettings());
    const syncFromOtherWindow = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) reload();
    };
    window.addEventListener("storage", syncFromOtherWindow);
    window.addEventListener(SAVED_IN_THIS_WINDOW, reload);
    return () => {
      window.removeEventListener("storage", syncFromOtherWindow);
      window.removeEventListener(SAVED_IN_THIS_WINDOW, reload);
    };
  }, []);

  return [settings, setSettings] as const;
}
