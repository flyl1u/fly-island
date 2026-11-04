import { useMemo } from "react";
import { pluginPageId } from "../../features/plugin-views/model";
import { visiblePluginViews } from "../../features/plugin-views/pagePrefs";
import { topStatusItem } from "../../features/plugin-views/statusItems";
import { usePluginPagePrefs } from "../../features/plugin-views/usePluginPagePrefs";
import { usePluginViews } from "../../features/plugin-views/usePluginViews";
import { isPluginPage } from "./features";
import type { IslandPage, PluginPageId } from "./types";

/**
 * The plugin pages the island shows (in the order set in settings, hidden ones
 * left out), the entry of the open one (null on a built-in page), and the
 * status text for the collapsed bar.
 */
export function usePluginPages(page: IslandPage) {
  const snapshot = usePluginViews();
  const [prefs] = usePluginPagePrefs();
  const views = useMemo(() => visiblePluginViews(snapshot.views, prefs), [prefs, snapshot.views]);
  const pageIds = useMemo<PluginPageId[]>(() => views.map((view) => pluginPageId(view.pluginId, view.viewId)), [views]);
  const entry = isPluginPage(page) ? views.find((view) => pluginPageId(view.pluginId, view.viewId) === page) ?? null : null;
  const topStatus = useMemo(() => topStatusItem(snapshot.status), [snapshot.status]);
  // A click on the status text opens the plugin's first page, if it has one shown.
  const topStatusView = topStatus ? views.find((view) => view.pluginId === topStatus.pluginId) : undefined;
  const topStatusPage = topStatusView ? pluginPageId(topStatusView.pluginId, topStatusView.viewId) : null;
  return { views, pageIds, entry, topStatus, topStatusPage };
}
