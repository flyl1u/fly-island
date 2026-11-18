import { useEffect } from "react";
import { hideTranslationWindow, setTranslationEnabled, setTranslationShortcut, setTranslationTarget } from "./api";
import { loadSettings } from "./storage";
import { useTranslationSettings } from "./useTranslationSettings";

/**
 * Keeps the native translation shortcut in step with the translation switch. Called
 * from the island window, which runs for the whole session. Switching on registers
 * the saved shortcut again; switching off releases it and hides an open window.
 * `inIsland` sends the window shortcut to the island page, and hides the window.
 * The shortcut switch in translation settings releases only the keys: the native
 * "enabled" flag gates nothing but the shortcut, so it is on when both are.
 */
export function useTranslationEnabled(enabled: boolean, inIsland: boolean) {
  const shortcutEnabled = useTranslationSettings()[0].shortcutEnabled;
  useEffect(() => {
    void setTranslationEnabled(enabled && shortcutEnabled)
      .then(() => {
        if (!enabled) return hideTranslationWindow();
        if (!shortcutEnabled) return setTranslationTarget(inIsland).then(() => (inIsland ? hideTranslationWindow() : undefined));
        const settings = loadSettings();
        return Promise.all([
          setTranslationTarget(inIsland).then(() => (inIsland ? hideTranslationWindow() : undefined)),
          setTranslationShortcut(settings.shortcut),
        ]);
      })
      .catch((error) => {
        console.error("Failed to switch quick translation", error);
      });
  }, [enabled, inIsland, shortcutEnabled]);
}
