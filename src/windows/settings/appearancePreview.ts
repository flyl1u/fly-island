import type { IslandSettings } from "../../features/appearance/types";
import type { PanelPreviewMode } from "./panelPreview";

const COLLAPSED_FIELDS = [
  "topEdgeShoulders", "topEdgeShoulderSize", "collapsedScale", "collapsedAutoWidth", "collapsedWidth", "collapsedHeight",
  "collapsedLayout", "collapsedPriority", "collapsedShowCover", "showCollapsedText",
  "islandBackgroundColor", "taskTextColor", "pulseColor", "opacity",
] as const satisfies readonly (keyof IslandSettings)[];
const EXPANDED_FIELDS = [
  "expandedScale", "fontFamily", "islandFontPercent", "pageButtonStyle", "appearanceMode", "glassIntensity", "colorScheme",
] as const satisfies readonly (keyof IslandSettings)[];

/** Each appearance control reveals the part it changes; behavior settings do not open the island. */
export function appearancePreviewMode(current: IslandSettings, next: IslandSettings): PanelPreviewMode | null {
  const changed = (key: keyof IslandSettings) => {
    const left = current[key];
    const right = next[key];
    return Array.isArray(left) && Array.isArray(right) ? left.join() !== right.join() : left !== right;
  };
  if (COLLAPSED_FIELDS.some(changed)) return "collapsed";
  if (EXPANDED_FIELDS.some(changed)) return "expanded";
  return null;
}
