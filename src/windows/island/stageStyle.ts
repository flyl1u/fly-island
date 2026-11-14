import type { CSSProperties } from "react";
import { cornerShapeCss } from "../../features/appearance/cornerShape";
import { hexToRgba, isGlass } from "../../features/appearance/settings";
import type { ColorPalette } from "../../features/appearance/colorPalette";
import type { IslandSettings } from "../../features/appearance/types";
import { inkOn } from "../../utils/color";
import { getGlassStyle } from "./glassStyle";

/**
 * CSS custom properties for the island stage, derived from the appearance settings, the colours
 * drawn in the current scheme (theme.ts resolveSchemeColors) and the current size.
 */
export function getIslandStageStyle(
  settings: IslandSettings,
  colors: ColorPalette,
  collapsedIslandWidth: number,
  expandedIslandHeight: number,
) {
  return ({
    // Classic opacity fades the fill only, so text and icons on it stay solid.
    "--island-fill": hexToRgba(colors.islandBackgroundColor, settings.opacity / 100),
    "--island-fill-alpha": settings.opacity / 100,
    // The collapsed bar's and the page panel's scales (IslandShell.css); neither animates.
    "--island-collapsed-scale-target": settings.collapsedScale,
    "--island-expanded-scale-target": settings.expandedScale,
    "--collapsed-island-width": `${collapsedIslandWidth}px`,
    "--collapsed-island-height": `${settings.collapsedHeight}px`,
    "--expanded-island-height": `${expandedIslandHeight}px`,
    "--island-font-scale": settings.islandFontPercent / 100,
    // Unitless; IslandShell.css derives the collapsed, detached and inner panel radii from it.
    "--island-corner-radius-size": settings.islandCornerRadius,
    // The corner-shape of the island and every layer that inherits its radius (IslandShell.css).
    "--island-corner-shape": cornerShapeCss(settings.islandCornerShape),
    "--island-shoulder-size-target": `${settings.topEdgeShoulderSize}px`,
    "--task-text-color": colors.taskTextColor,
    "--island-pulse-color": colors.pulseColor,
    "--island-pulse-glow-color": hexToRgba(colors.pulseColor, 0.72),
    "--island-pulse-brightness": `${settings.pulseBrightness}%`,
    "--island-background-color": colors.islandBackgroundColor,
    // Text drawn straight on the island (the Agent page) flips to dark on a light background.
    "--island-ink-rgb": inkOn(colors.islandBackgroundColor),
    ...(isGlass(settings.material) ? getGlassStyle(settings, colors) : {}),
    "--todo-background-color": settings.todoBackgroundColor,
  }) as CSSProperties;
}
