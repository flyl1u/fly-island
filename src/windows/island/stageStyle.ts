import type { CSSProperties } from "react";
import { cornerShapeCss } from "../../features/appearance/cornerShape";
import { localIslandFontStyle } from "../../features/appearance/localFont";
import { hexToRgba, isGlass } from "../../features/appearance/settings";
import type { ColorPalette } from "../../features/appearance/colorPalette";
import type { IslandSettings } from "../../features/appearance/types";
import { inkOn, rgbChannels } from "../../utils/color";
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
  /** A message preview's grown height (useMessageNotice) in place of the collapsed height. */
  noticeHeight: number | null = null,
) {
  return ({
    ...localIslandFontStyle(settings),
    // Classic opacity fades the fill only, so text and icons on it stay solid.
    "--island-fill": hexToRgba(colors.islandBackgroundColor, settings.opacity / 100),
    "--island-fill-alpha": settings.opacity / 100,
    // The collapsed bar's and the page panel's scales (IslandShell.css); neither animates.
    "--island-collapsed-scale-target": settings.collapsedScale,
    "--island-expanded-scale-target": settings.expandedScale,
    "--collapsed-island-width": `${collapsedIslandWidth}px`,
    "--collapsed-island-height": `${noticeHeight ?? settings.collapsedHeight}px`,
    "--collapsed-island-padding": `${settings.collapsedPadding}px`,
    "--expanded-island-height": `${expandedIslandHeight}px`,
    "--island-font-scale": settings.islandFontPercent / 100,
    // Unitless; IslandShell.css derives the collapsed, detached and inner panel radii from it.
    "--island-corner-radius-size": settings.islandCornerRadius,
    "--island-collapsed-corner-radius-size": settings.collapsedCornerRadius,
    // The corner-shape of the island and every layer that inherits its radius (IslandShell.css).
    "--island-corner-shape": cornerShapeCss(settings.islandCornerShape),
    "--island-shoulder-size-factor": settings.islandCornerShape === "squircle" ? 1.4 : 1,
    "--island-shoulder-size-target": `${settings.topEdgeShoulderSize}px`,
    // The expanded page's resting transform. At scale 1 it is none: a transform, even scale(1), keeps
    // the page on its own compositing layer, and the text there is drawn again once the layer goes.
    "--island-panel-shown": settings.expandedScale === 1 ? "none" : `scale(${settings.expandedScale})`,
    "--island-panel-hidden": settings.expandedScale === 1 ? "translateY(-6px)" : `translateY(-6px) scale(${settings.expandedScale})`,
    "--task-text-color": colors.taskTextColor,
    "--island-pulse-color": colors.pulseColor,
    "--island-pulse-glow-color": hexToRgba(colors.pulseColor, 0.72),
    "--island-pulse-brightness": `${settings.pulseBrightness}%`,
    "--island-background-color": colors.islandBackgroundColor,
    // Text drawn straight on the island (the Agent page) flips to dark on a light background.
    "--island-ink-rgb": inkOn(colors.islandBackgroundColor),
    ...pageInkStyle(settings.pageTextColor),
    ...(isGlass(settings.material) ? getGlassStyle(settings, colors) : {}),
    // The glass shadow's scale from the open size down to the collapsed bar (IslandGlass.css).
    "--glass-shadow-collapsed-scale": glassShadowScale(settings, collapsedIslandWidth, expandedIslandHeight),
    "--todo-background-color": settings.todoBackgroundColor,
  }) as CSSProperties;
}

function glassShadowScale(settings: IslandSettings, collapsedWidth: number, expandedHeight: number) {
  const open = (size: number) => Math.max(1, size * settings.expandedScale);
  const x = (collapsedWidth * settings.collapsedScale) / open(560);
  const y = (settings.collapsedHeight * settings.collapsedScale) / open(expandedHeight);
  return `${x.toFixed(4)}, ${y.toFixed(4)}`;
}

/**
 * Settings → Appearance → Page text: the colour's channels, together and one by one, for
 * IslandPageText.css. Nothing while it is unset, so the page keeps the scheme's ink.
 */
function pageInkStyle(pageTextColor: string): Record<string, string> {
  if (!pageTextColor) return {};
  const [red, green, blue] = rgbChannels(pageTextColor);
  return {
    "--island-page-ink-rgb": `${red}, ${green}, ${blue}`,
    "--page-ink-r": String(red),
    "--page-ink-g": String(green),
    "--page-ink-b": String(blue),
  };
}
