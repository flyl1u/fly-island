import { useCallback, useEffect } from "react";
import { listenSettingsOpenRequested, openSettingsWindow } from "../settings/api";
import { loadDetachedSettings, requestSettingsFocus, saveDetachedSettings, type SettingsFocusSection } from "../settings/storage";
import type { IslandPage } from "./types";

export function useSettingsNavigation(openIslandPage: (page: IslandPage) => void, setPage: (page: IslandPage) => void) {
  const openSettings = useCallback((section?: SettingsFocusSection) => {
    if (section) requestSettingsFocus(section);
    if (loadDetachedSettings()) {
      void openSettingsWindow().catch((error) => console.error("Failed to open settings", error));
    } else {
      openIslandPage("settings");
    }
  }, [openIslandPage]);

  const changePresentation = useCallback(async (detached: boolean) => {
    if (!saveDetachedSettings(detached) || !detached) return;
    try {
      await openSettingsWindow();
      setPage("todo");
    } catch (error) {
      saveDetachedSettings(false);
      console.error("Failed to detach settings", error);
    }
  }, [setPage]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listenSettingsOpenRequested(() => openSettings()).then((stop) => {
      if (cancelled) stop();
      else unlisten = stop;
    }).catch((error) => console.error("Failed to listen for settings requests", error));
    return () => { cancelled = true; unlisten?.(); };
  }, [openSettings]);

  return { openSettings, changePresentation };
}
