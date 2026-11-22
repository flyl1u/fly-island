import { Activity, Battery, Gauge, HeartPulse, Puzzle, Timer, type LucideIcon } from "lucide-react";
import type { PluginPanelIcon } from "./panelTypes";

export type { PluginPanelIcon } from "./panelTypes";

export const PLUGIN_PANEL_ICONS: Record<PluginPanelIcon, LucideIcon> = {
  battery: Battery,
  "heart-pulse": HeartPulse,
  activity: Activity,
  timer: Timer,
  gauge: Gauge,
  puzzle: Puzzle,
};
