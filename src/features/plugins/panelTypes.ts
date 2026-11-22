// Mirrors PANEL_ICONS in src-tauri/src/plugin_host/manifest.rs: a plugin names one of the
// host's icons rather than shipping artwork of its own. Keep this module free of React and
// icon imports — the node tests load it through the island's page helpers.
export type PluginPanelIcon = "battery" | "heart-pulse" | "activity" | "timer" | "gauge" | "puzzle";

export const PLUGIN_PANEL_ICON_NAMES: readonly PluginPanelIcon[] = ["battery", "heart-pulse", "activity", "timer", "gauge", "puzzle"];

export function isPluginPanelIcon(value: string): value is PluginPanelIcon {
  return (PLUGIN_PANEL_ICON_NAMES as readonly string[]).includes(value);
}
