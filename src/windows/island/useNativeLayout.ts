import { useCallback, useEffect, useRef } from "react";
import type { IslandSettings } from "../../features/appearance/types";
import * as islandApi from "./api";

/** Pushes scale and margin changes to the native window, at most one call in flight per frame. */
export function useNativeLayout(settings: IslandSettings) {
  const layoutSync = useRef<{
    frame: number | null;
    inFlight: boolean;
    pending: IslandSettings;
    active: IslandSettings;
  }>({
    frame: null,
    inFlight: false,
    pending: settings,
    active: settings,
  });

  const syncNativeLayout = useCallback(async (nextSettings: IslandSettings) => {
    try {
      await islandApi.setIslandLayout({
        collapsedScale: nextSettings.collapsedScale,
        expandedScale: nextSettings.expandedScale,
        marginY: nextSettings.marginY,
      });
    } catch (error) {
      console.error("Failed to sync island layout", error);
    }
  }, []);

  const flushNativeLayout = useCallback(() => {
    const syncState = layoutSync.current;

    if (syncState.inFlight) {
      return;
    }

    const nextSettings = syncState.pending;
    syncState.active = nextSettings;
    syncState.inFlight = true;

    void syncNativeLayout(nextSettings).finally(() => {
      const latestState = layoutSync.current;
      latestState.inFlight = false;

      if (latestState.pending !== latestState.active) {
        latestState.frame = window.requestAnimationFrame(() => {
          latestState.frame = null;
          flushNativeLayout();
        });
      }
    });
  }, [syncNativeLayout]);

  const scheduleNativeLayout = useCallback(
    (nextSettings: IslandSettings) => {
      const syncState = layoutSync.current;
      syncState.pending = nextSettings;

      if (syncState.frame !== null || syncState.inFlight) {
        return;
      }

      syncState.frame = window.requestAnimationFrame(() => {
        syncState.frame = null;
        flushNativeLayout();
      });
    },
    [flushNativeLayout],
  );

  useEffect(() => {
    scheduleNativeLayout(settings);
  }, [settings.marginY, scheduleNativeLayout]);

  return syncNativeLayout;
}
