import { useMemo, useState } from "react";
import { pluginPageId } from "../../features/plugin-views/model";
import { visiblePluginViews } from "../../features/plugin-views/pagePrefs";
import { usePluginPagePrefs } from "../../features/plugin-views/usePluginPagePrefs";
import { usePluginViews } from "../../features/plugin-views/usePluginViews";
import { isPluginPage } from "./features";
import type { IslandPage, PluginPageId } from "./types";

/**
 * The plugin pages the island shows (in the order set in settings, hidden ones
 * left out), the entry of the open one (null on a built-in page) and the rows
 * its list reports, for the island's height.
 */
export function usePluginPages(page: IslandPage) {
  const allViews = usePluginViews();
  const [prefs] = usePluginPagePrefs();
  const views = useMemo(() => visiblePluginViews(allViews, prefs), [allViews, prefs]);
  const pageIds = useMemo<PluginPageId[]>(() => views.map((view) => pluginPageId(view.pluginId, view.viewId)), [views]);
  const entry = isPluginPage(page) ? views.find((view) => pluginPageId(view.pluginId, view.viewId) === page) ?? null : null;
  // Only the open list reports rows; other templates and pages leave this unused.
  const [rows, setRows] = useState<number | null>(null);
  return { views, pageIds, entry, rows: entry?.template === "list" ? rows : null, setRows };
}
