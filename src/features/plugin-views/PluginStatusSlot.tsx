import { useMemo } from "react";
import type { PluginViewEntry } from "./api";
import { pluginPageId } from "./model";
import { PluginStatusChip } from "./PluginStatusChip";
import { topStatusItem } from "./statusItems";
import { usePluginStatus } from "./usePluginViews";

/**
 * The collapsed bar's plugin status text. It listens for status changes itself,
 * so a ticking countdown re-renders only this chip.
 */
export function PluginStatusSlot({
  views,
  onOpen,
}: {
  /** The plugin pages shown on the island; a click opens the status plugin's first one. */
  views: readonly PluginViewEntry[];
  onOpen: (page: `plugin:${string}`) => void;
}) {
  const status = usePluginStatus();
  const top = useMemo(() => topStatusItem(status), [status]);
  if (!top) return null;
  const view = views.find((candidate) => candidate.pluginId === top.pluginId);
  const page = view ? pluginPageId(view.pluginId, view.viewId) : null;
  return <PluginStatusChip status={top} onOpen={page ? () => onOpen(page) : null} />;
}
