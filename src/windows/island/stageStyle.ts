import type { CSSProperties } from "react";
import { hexToRgba } from "../../features/appearance/settings";
import type { IslandSettings } from "../../features/appearance/types";
import { inkOn } from "../../utils/color";
import type { IslandMode } from "./types";

/** CSS custom properties for the island stage, derived from the appearance settings and current size. */
export function getIslandStageStyle(
  settings: IslandSettings,
  mode: IslandMode,
  collapsedIslandWidth: number,
  expandedIslandHeight: number,
) {
  const glassStrength = settings.glassIntensity / 100;
  const glassMaskOpacity = settings.opacity / 100;

  return ({
    "--island-opacity": settings.opacity / 100,
    "--island-scale": mode === "collapsed" ? settings.collapsedScale : settings.expandedScale,
    "--collapsed-island-width": `${collapsedIslandWidth}px`,
    "--expanded-island-height": `${expandedIslandHeight}px`,
    // Unitless so IslandTopEdge.css can also fade the fillet layers out at 0.
    "--island-top-fillet-size": settings.topFilletRadius,
    // Unitless; IslandShell.css derives the collapsed, detached and inner panel radii from it.
    "--island-corner-radius-size": settings.islandCornerRadius,
    "--task-text-color": settings.taskTextColor,
    "--island-pulse-color": settings.pulseColor,
    "--island-pulse-glow-color": hexToRgba(settings.pulseColor, 0.72),
    "--island-pulse-brightness": `${settings.pulseBrightness}%`,
    "--island-background-color": settings.islandBackgroundColor,
    // Text drawn straight on the island (the Agent page) flips to dark on a light background.
    "--island-ink-rgb": inkOn(settings.islandBackgroundColor),
    "--glass-intensity": glassStrength,
    "--glass-mask-opacity": glassMaskOpacity,
    "--glass-soft-alpha": 0.045 + glassStrength * 0.045,
    "--glass-shadow-alpha": 0.14 + glassStrength * 0.1,
    "--glass-inset-alpha": 0.2 + glassStrength * 0.2,
    "--glass-cyan-alpha": glassStrength * 0.16,
    "--glass-magenta-alpha": glassStrength * 0.1,
    "--glass-glow-alpha": 0.16 + glassStrength * 0.14,
    "--glass-accent-alpha": glassStrength * 0.055,
    "--glass-refraction-opacity": 0.45 + glassStrength * 0.38,
    "--glass-border-alpha": 0.1 + glassStrength * 0.18,
    "--glass-inner-accent-alpha": glassStrength * 0.08,
    "--glass-highlight-opacity": 0.34 + glassStrength * 0.38,
    "--glass-panel-accent-alpha": glassStrength * 0.085,
    "--glass-panel-blur": `${10 + glassStrength * 9}px`,
    "--glass-tint-color": hexToRgba(
      settings.islandBackgroundColor,
      glassMaskOpacity,
    ),
    "--glass-collapsed-tint-color": hexToRgba(
      settings.islandBackgroundColor,
      glassMaskOpacity,
    ),
    "--todo-background-color": settings.todoBackgroundColor,
  }) as CSSProperties;
}
