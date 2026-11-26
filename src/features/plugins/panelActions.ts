import type { PluginPanel } from "./api";

/**
 * The actions the page offers. A plugin may publish actions only its own windows use — Eye Care
 * keeps postpone and skip on the break window — and leave them off the island by naming the
 * subset in `islandActions`; without that field the page shows every published action.
 */
export function islandPanelActions(panel: PluginPanel | null | undefined): string[] {
  return panel?.islandActions ?? panel?.actions ?? [];
}
