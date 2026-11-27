// Line icons for the sidebar entries of plugins with a page of their own, and the tile of a development
// plugin outside the catalog. Market cards and group titles use the full-colour app icons instead.
import { Activity, BatteryMedium, BellRing, CloudSun, Eye, Gauge, HeartPulse, Puzzle, Timer, type LucideIcon } from "lucide-react";
import type { PluginPanelIcon } from "./panelTypes";

const PLUGIN_LINE_ICONS: Readonly<Record<string, LucideIcon>> = {
  clockWeather: CloudSun,
  "eye-care": Eye,
  "device-battery": BatteryMedium,
  "water-reminder": BellRing,
};

const PANEL_ICONS: Record<PluginPanelIcon, LucideIcon> = {
  battery: BatteryMedium, "heart-pulse": HeartPulse, activity: Activity, timer: Timer, gauge: Gauge, puzzle: Puzzle,
};

/** A plugin outside the catalog goes by the panel icon its manifest names. */
export function pluginLineIcon(id: string, panelIcon?: PluginPanelIcon): LucideIcon {
  return PLUGIN_LINE_ICONS[id] ?? (panelIcon ? PANEL_ICONS[panelIcon] : undefined) ?? Puzzle;
}
