import { useCallback, useEffect } from "react";
import {
  OPEN_SETTINGS_PAGE_EVENT,
  listenSettingsOpenRequested,
  openStandaloneSettingsWindow,
} from "../settings/api";
import { loadDetachedSettings, saveDetachedSettings } from "../settings/storage";
import type { IslandPage } from "./types";

function reportFailure(error: unknown) {
  console.error("Failed to open settings", error);
}

/**
 * Where the island opens settings: its own settings page, or the standalone window when
 * General → Separate settings window is on. Answers the header button, the island's own
 * links (OPEN_SETTINGS_PAGE_EVENT), and the tray and translation window (a Tauri event).
 */
export function useSettingsNavigation(openIslandPage: (page: IslandPage) => void, setPage: (page: IslandPage) => void) {
  const openSettings = useCallback(() => {
    if (loadDetachedSettings()) void openStandaloneSettingsWindow().catch(reportFailure);
    else openIslandPage("settings");
  }, [openIslandPage]);

  /** Moving settings out opens the window and leaves the island's settings page. */
  const changePresentation = useCallback(async (detached: boolean) => {
    if (!saveDetachedSettings(detached) || !detached) return;
    try {
      await openStandaloneSettingsWindow();
      setPage("todo");
    } catch (error) {
      saveDetachedSettings(false);
      reportFailure(error);
    }
  }, [setPage]);

  useEffect(() => {
    window.addEventListener(OPEN_SETTINGS_PAGE_EVENT, openSettings);
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listenSettingsOpenRequested(openSettings)
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch((error) => console.error("Failed to listen for settings requests", error));
    return () => {
      cancelled = true;
      unlisten?.();
      window.removeEventListener(OPEN_SETTINGS_PAGE_EVENT, openSettings);
    };
  }, [openSettings]);

  return { openSettings, changePresentation };
}
