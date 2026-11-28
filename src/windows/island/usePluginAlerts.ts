import { useEffect, useRef } from "react";
import type { IslandFeatures } from "./features";
import type { IslandPage } from "./types";
import type { IslandModeReason } from "./diagnosticMode";
import { holdIsland } from "./islandHold";
import { isIslandVisible } from "./api";

/**
 * A plugin asking for attention with no deadline (Eye Care's break time) opens the island on its
 * page once, holds it there until its actions clear the alert, and closes it again with the
 * answer — like a todo timer that runs out. A plugin that brings a deadline keeps its page quiet
 * and shows its own window instead.
 */
export function usePluginAlerts(
  features: IslandFeatures,
  openIslandPage: (page: IslandPage, reason?: IslandModeReason) => void,
  collapseIsland: (reason?: IslandModeReason) => void,
  quiet: boolean,
) {
  const alertPage = features.pluginPages?.find((info) => info.islandAlert)?.page ?? null;
  const announced = useRef<IslandPage | null>(null);
  const alerting = useRef(false);
  useEffect(() => {
    const wasAlerting = alerting.current;
    alerting.current = alertPage !== null;
    if (alertPage) {
      // One opening per alert: closing the island by hand must not be undone on the next render.
      if (announced.current === alertPage) return;
      announced.current = alertPage;
      if (!quiet) openWhenVisible(alertPage, openIslandPage);
      return;
    }
    announced.current = null;
    // Postponing the break or calling it done clears the alert: the island that came with it goes.
    if (wasAlerting) collapseIsland("plugin_alert");
  }, [alertPage, quiet, openIslandPage, collapseIsland]);
  // While the alert stands, an outside click must not make it disappear (islandHold.ts).
  useEffect(() => (alertPage ? holdIsland("plugin_alert") : undefined), [alertPage]);
}

/** Like a todo timer that runs out: an island hidden in the tray is not brought out. */
function openWhenVisible(page: IslandPage, open: (page: IslandPage, reason?: IslandModeReason) => void) {
  void isIslandVisible()
    .then((visible) => {
      if (visible) open(page, "plugin_alert");
    })
    .catch((error: unknown) => console.error("Failed to check island visibility for a plugin alert", error));
}
