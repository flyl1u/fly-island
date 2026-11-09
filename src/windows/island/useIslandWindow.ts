import { getEffectiveAppearanceMode } from "../../features/appearance/settings";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { DEFAULT_SETTINGS } from "../../features/appearance/settings";
import type { IslandSettings } from "../../features/appearance/types";
import * as islandApi from "./api";
import { clearIslandPosition } from "./storage";
import { useIslandPosition } from "./useIslandPosition";
import { useNativeLayout } from "./useNativeLayout";
import { useSettingsPositionReset } from "./useSettingsPositionReset";
import type { IslandMode, NativeGlassState } from "./types";

type IslandWindowOptions = {
  mode: IslandMode;
  isTucked: boolean;
  settings: IslandSettings;
  setSettings: (settings: IslandSettings) => void;
  expandedIslandHeight: number;
  collapsedIslandWidth: number;
  onCollapse: () => void;
};

/** Keeps the native island window (size, position, glass, focus) in sync with the island's state. */
export function useIslandWindow({
  mode,
  isTucked,
  settings,
  setSettings,
  expandedIslandHeight,
  collapsedIslandWidth,
  onCollapse,
}: IslandWindowOptions) {
  const syncNativeLayout = useNativeLayout(settings);
  const { isPositionDetached, setIsPositionDetached, islandPositionRef, startIslandDrag } = useIslandPosition();
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [nativeGlassState, setNativeGlassState] =
    useState<NativeGlassState>("disabled");
  const didShowInitialWindow = useRef(false);
  const syncNativeInteraction = useCallback(
    async (
      nextMode: IslandMode,
      nextSettings: IslandSettings,
      nextExpandedHeight: number,
      nextCollapsedWidth: number,
      nextIsTucked: boolean,
    ) => {
      try {
        const glassState = await islandApi.setIslandInteraction({
          mode: nextMode,
          collapsedScale: nextSettings.collapsedScale,
          expandedScale: nextSettings.expandedScale,
          marginY: nextSettings.marginY,
          expandedHeight: nextExpandedHeight,
          collapsedWidth: nextCollapsedWidth,
          customPosition: islandPositionRef.current,
          isTucked: nextIsTucked,
          animatePosition: !reducedMotion,
          glassEnabled: getEffectiveAppearanceMode(nextSettings.appearanceMode) === "liquidGlass",
          glassIntensity: nextSettings.glassIntensity,
          glassTint: nextSettings.islandBackgroundColor,
          cornerRadius: nextSettings.islandCornerRadius,
          cornerShape: nextSettings.islandCornerShape,
          monitorFollow: nextSettings.islandMonitor,
        });
        setNativeGlassState(glassState);
      } catch (error) {
        console.error("Failed to sync island interaction", error);
        setNativeGlassState(
          getEffectiveAppearanceMode(nextSettings.appearanceMode) === "liquidGlass"
            ? "css-fallback"
            : "disabled",
        );
      }
    },
    [islandPositionRef, reducedMotion],
  );

  const showReadyIsland = useCallback(async () => {
    if (didShowInitialWindow.current) {
      return;
    }

    didShowInitialWindow.current = true;

    try {
      await islandApi.showReadyIsland();
    } catch (error) {
      console.error("Failed to show island", error);
    }
  }, []);

  const minimizeIsland = useCallback(async () => {
    try {
      await islandApi.minimizeIsland();
    } catch (error) {
      console.error("Failed to minimize island", error);
    }
  }, []);

  const resetIslandPosition = useCallback(async () => {
    try {
      const nextSettings = { ...settings, marginY: DEFAULT_SETTINGS.marginY };
      await syncNativeLayout(nextSettings);
      await islandApi.resetIslandPosition();
      islandPositionRef.current = null;
      setIsPositionDetached(false);
      clearIslandPosition();
      setSettings(nextSettings);
    } catch (error) {
      console.error("Failed to reset island position", error);
    }
  }, [islandPositionRef, setIsPositionDetached, setSettings, settings, syncNativeLayout]);
  useSettingsPositionReset(resetIslandPosition);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateReducedMotion = () => setReducedMotion(query.matches);
    query.addEventListener("change", updateReducedMotion);
    return () => query.removeEventListener("change", updateReducedMotion);
  }, []);

  useEffect(() => {
    void syncNativeInteraction(
      mode,
      settings,
      expandedIslandHeight,
      collapsedIslandWidth,
      isTucked,
    ).finally(() => {
      void showReadyIsland();
    });
    // Lists exactly the settings fields syncNativeInteraction sends, so unrelated
    // settings changes do not cost a native round trip (expansion performance).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    expandedIslandHeight,
    collapsedIslandWidth,
    isTucked,
    mode,
    settings.marginY,
    settings.appearanceMode,
    settings.glassIntensity,
    settings.islandBackgroundColor,
    settings.collapsedScale,
    settings.expandedScale,
    settings.islandCornerRadius,
    settings.islandCornerShape,
    settings.islandMonitor,
    showReadyIsland,
    syncNativeInteraction,
  ]);

  useEffect(() => {
    let didCancel = false;
    let unlisten: (() => void) | null = null;

    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!focused && mode === "expanded") {
          onCollapse();
        }
      })
      .then((nextUnlisten) => {
        if (didCancel) {
          nextUnlisten();
        } else {
          unlisten = nextUnlisten;
        }
      })
      .catch((error) => {
        console.error("Failed to listen for island focus changes", error);
      });

    return () => {
      didCancel = true;
      unlisten?.();
    };
  }, [onCollapse, mode]);

  return { isPositionDetached, nativeGlassState, minimizeIsland, startIslandDrag, resetIslandPosition };
}
