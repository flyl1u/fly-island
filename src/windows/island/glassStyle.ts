import { glassTintAlpha, hexToRgba } from "../../features/appearance/settings";
import type { ColorPalette } from "../../features/appearance/colorPalette";
import type { IslandSettings } from "../../features/appearance/types";

/**
 * The glass materials' variables (IslandGlass.css). Both are CSS only: the island window is a
 * transparent stage much larger than the island, so a native blur would blur the whole stage.
 * Liquid glass is a nearly clear pane, so most of its look is the lit rim; frosted glass is a
 * milky or smoky pane that hides most of what is behind it. The strength setting makes liquid
 * glass clearer with brighter edges, and frosted glass a little clearer.
 */
export function getGlassStyle(settings: IslandSettings, colors: ColorPalette) {
  const strength = settings.glassIntensity / 100;
  const opacity = settings.opacity / 100;
  const liquid = settings.material === "liquidGlass";
  const tint = hexToRgba(colors.islandBackgroundColor, opacity * glassTintAlpha(settings.material, settings.glassIntensity));
  return {
    "--glass-intensity": strength,
    "--glass-tint-color": tint,
    "--glass-collapsed-tint-color": tint,
    "--glass-shadow-alpha": 0.14 + strength * 0.1,
    "--glass-sheen-alpha": liquid ? 0.06 + strength * 0.1 : 0.05,
    "--glass-border-alpha": liquid ? 0.22 + strength * 0.3 : 0.14 + strength * 0.08,
    "--glass-inset-alpha": liquid ? 0.3 + strength * 0.4 : 0.22 + strength * 0.12,
    "--glass-inner-glow-alpha": liquid ? 0.05 + strength * 0.1 : 0,
    "--glass-glow-alpha": 0.08 + strength * 0.1,
    "--glass-accent-alpha": strength * 0.08,
    "--glass-highlight-opacity": 0.34 + strength * 0.5,
    "--glass-grain-opacity": liquid ? 0.05 + strength * 0.03 : 0.035,
    "--glass-panel-accent-alpha": strength * 0.085,
  };
}
