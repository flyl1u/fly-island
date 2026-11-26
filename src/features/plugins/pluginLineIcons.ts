// A plugin's line icon: the sidebar entry of its settings page. PluginIcon.tsx draws the tiles.
import { Activity, BatteryMedium, CalendarDays, CloudSun, Eye, Gauge, HeartPulse, Puzzle, Timer, type LucideIcon } from "lucide-react";
import type { PluginPanelIcon } from "./panelTypes";

const PLUGIN_LINE_ICONS: Readonly<Record<string, LucideIcon>> = {
  clockWeather: CloudSun,
  calendarMarks: CalendarDays,
  "eye-care": Eye,
  "device-battery": BatteryMedium,
};

const PANEL_ICONS: Record<PluginPanelIcon, LucideIcon> = {
  battery: BatteryMedium, "heart-pulse": HeartPulse, activity: Activity, timer: Timer, gauge: Gauge, puzzle: Puzzle,
};

/** A plugin outside the catalog goes by the panel icon its manifest names. */
export function pluginLineIcon(id: string, panelIcon?: PluginPanelIcon): LucideIcon {
  return PLUGIN_LINE_ICONS[id] ?? (panelIcon ? PANEL_ICONS[panelIcon] : undefined) ?? Puzzle;
}
