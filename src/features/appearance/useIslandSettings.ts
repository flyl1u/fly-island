import { useEffect, useRef, useState } from "react";
import { isSameSettings } from "./settings";
import { STORAGE_KEY, loadSettings, saveSettings } from "./storage";
import type { IslandSettings } from "./types";

/** The island's appearance settings, persisted and kept in sync with the settings window. */
export function useIslandSettings() {
  const [settings, setSettings] = useState<IslandSettings>(loadSettings);
  // Settings just read from the other window's write. Saving them back would echo: while a colour
  // is dragged, the other window has already written a newer value, and the echo would put the
  // older one over it, pull that window back, and the colour would flicker and stick.
  const readFromStorage = useRef<IslandSettings | null>(null);

  useEffect(() => {
    if (readFromStorage.current === settings) return;
    saveSettings(settings);
  }, [settings]);

  // The settings window edits this key; storage events deliver its changes here.
  useEffect(() => {
    const syncFromSettingsWindow = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        const nextSettings = loadSettings();
        setSettings((current) => {
          if (isSameSettings(current, nextSettings)) return current;
          readFromStorage.current = nextSettings;
          return nextSettings;
        });
      }
    };

    window.addEventListener("storage", syncFromSettingsWindow);
    return () => window.removeEventListener("storage", syncFromSettingsWindow);
  }, []);

  return [settings, setSettings] as const;
}
