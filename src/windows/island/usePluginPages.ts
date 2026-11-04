import { useMemo } from "react";
import { pluginPageId } from "../../features/plugin-views/model";
import { topStatusItem } from "../../features/plugin-views/statusItems";
import { usePluginViews } from "../../features/plugin-views/usePluginViews";
import { isPluginPage } from "./features";
import type { IslandPage, PluginPageId } from "./types";

/** The plugin pages the island shows, and the entry of the open one (null on a built-in page). */
export function usePluginPages(page: IslandPage) {
  const { views, status } = usePluginViews();
  const pageIds = useMemo<PluginPageId[]>(() => views.map((view) => pluginPageId(view.pluginId, view.viewId)), [views]);
  const entry = isPluginPage(page) ? views.find((view) => pluginPageId(view.pluginId, view.viewId) === page) ?? null : null;
  const topStatus = useMemo(() => topStatusItem(status), [status]);
  // A click on the status text opens the plugin's first page, if it has one.
  const topStatusView = topStatus ? views.find((view) => view.pluginId === topStatus.pluginId) : undefined;
  const topStatusPage = topStatusView ? pluginPageId(topStatusView.pluginId, topStatusView.viewId) : null;
  return { views, status, pageIds, entry, topStatus, topStatusPage };
}
