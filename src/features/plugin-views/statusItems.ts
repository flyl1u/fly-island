import type { PluginStatusEntry } from "./api";

/**
 * The one status text the collapsed bar shows: the highest priority, and of
 * equal ones the first plugin (in the island's plugin order). Null when no
 * plugin has a text set.
 */
export function topStatusItem(entries: readonly PluginStatusEntry[]): PluginStatusEntry | null {
  let top: PluginStatusEntry | null = null;
  for (const entry of entries) {
    if (!entry.text) continue;
    if (!top || entry.priority > top.priority) top = entry;
  }
  return top;
}
