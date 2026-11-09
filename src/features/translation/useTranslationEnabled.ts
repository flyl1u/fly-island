import { useEffect } from "react";
import { hideTranslationWindow, setTranslationEnabled, setTranslationShortcut, setTranslationTarget } from "./api";
import { loadSettings } from "./storage";

/**
 * Keeps the native translation shortcut in step with the translation switch. Called
 * from the island window, which runs for the whole session. Switching on registers
 * the saved shortcut again; switching off releases it and hides an open window.
 * `inIsland` sends the window shortcut to the island page, and hides the window.
 */
export function useTranslationEnabled(enabled: boolean, inIsland: boolean) {
  useEffect(() => {
    void setTranslationEnabled(enabled)
      .then(() => {
        if (!enabled) return hideTranslationWindow();
        const settings = loadSettings();
        return Promise.all([
          setTranslationTarget(inIsland).then(() => (inIsland ? hideTranslationWindow() : undefined)),
          setTranslationShortcut(settings.shortcut),
        ]);
      })
      .catch((error) => {
        console.error("Failed to switch quick translation", error);
      });
  }, [enabled, inIsland]);
}
