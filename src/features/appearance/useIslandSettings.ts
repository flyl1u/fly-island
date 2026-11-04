import { useEffect, useState } from "react";
import { isSameSettings } from "./settings";
import { STORAGE_KEY, loadSettings, saveSettings } from "./storage";
import type { IslandSettings } from "./types";

/** The island's appearance settings, persisted and kept in sync with the settings window. */
export function useIslandSettings() {
  const [settings, setSettings] = useState<IslandSettings>(loadSettings);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // The settings window edits this key; storage events deliver its changes here.
  useEffect(() => {
    const syncFromSettingsWindow = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        const nextSettings = loadSettings();
        setSettings((current) =>
          isSameSettings(current, nextSettings) ? current : nextSettings,
        );
      }
    };

    window.addEventListener("storage", syncFromSettingsWindow);
    return () => window.removeEventListener("storage", syncFromSettingsWindow);
  }, []);

  return [settings, setSettings] as const;
}
