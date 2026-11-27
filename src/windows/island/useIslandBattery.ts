import { getNotebookBattery } from "../../features/battery/api";
import { useBatterySnapshot } from "../../features/battery/useBatterySnapshot";
import { useNativePlugins } from "../../features/plugins";
import { isIslandVisible } from "./api";
import type { IslandMode, IslandPage } from "./types";

/** The battery, read while the Battery plugin is installed and the island can show it. */
export function useIslandBattery(recordHistory: boolean, mode: IslandMode, page: IslandPage, isTucked: boolean) {
  const enabled = useNativePlugins().battery;
  const detailsPage = mode === "expanded" && page === "battery";
  const observing = mode === "collapsed" || detailsPage;
  return useBatterySnapshot(
    { enabled, paused: isTucked, includeDetails: observing && !isTucked, recordHistory, observing },
    { read: getNotebookBattery, isVisible: isIslandVisible },
  );
}
