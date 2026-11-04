import { useEffect } from "react";
import { hideTranslationWindow, setTranslationEnabled, setTranslationShortcut } from "./api";
import { loadSettings } from "./storage";

/**
 * Keeps the native translation shortcut in step with the translation switch. Called
 * from the island window, which runs for the whole session. Switching on registers
 * the saved shortcut again; switching off releases it and hides an open window.
 */
export function useTranslationEnabled(enabled: boolean) {
  useEffect(() => {
    void setTranslationEnabled(enabled)
      .then(() => (enabled ? setTranslationShortcut(loadSettings().shortcut) : hideTranslationWindow()))
      .catch((error) => {
        console.error("Failed to switch quick translation", error);
      });
  }, [enabled]);
}
