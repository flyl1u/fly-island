import type { IslandSettings } from "../../features/appearance/types";
import type { PanelPreviewMode } from "./panelPreview";

const COLLAPSED_FIELDS = [
  "islandShape", "topEdgeShoulders", "topEdgeShoulderSize", "collapsedScale", "collapsedAutoWidth", "collapsedAutoWidthMin", "collapsedAutoWidthMax", "collapsedWidth", "collapsedHeight",
  "collapsedCornerRadius", "collapsedLayout", "collapsedHidden", "collapsedPadding", "collapsedPriority", "collapsedShowCover", "showCollapsedText", "idleText", "todoPendingDisplay",
  "islandBackgroundColor", "taskTextColor", "pulseColor", "opacity",
] as const satisfies readonly (keyof IslandSettings)[];
const EXPANDED_FIELDS = [
  "expandedScale", "fontFamily", "localFontFamily", "islandFontPercent", "pageButtonStyle", "material", "glassIntensity", "glassBlur", "colorScheme",
  "islandCornerRadius", "islandCornerShape",
  "pageTextColor",
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
