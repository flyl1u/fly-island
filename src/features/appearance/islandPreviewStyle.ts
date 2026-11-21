import type { CSSProperties } from "react";
import { inkOn } from "../../utils/color";
import { cornerShapeCss } from "./cornerShape";
import { shapedSettings } from "./islandShape";
import { localIslandFontStyle } from "./localFont";
import { COLLAPSED_WIDTH, glassTintAlpha, hexToRgba, isGlass, MAX_COLLAPSED_SCALE, MAX_EXPANDED_SCALE } from "./settings";
import type { IslandSettings } from "./types";
import { resolveSchemeColors, type ResolvedScheme } from "./theme";

/** Shared by the appearance drawing and the interactive collapsed-layout preview. */
export function islandPreviewStyle(settings: IslandSettings, scheme: ResolvedScheme) {
  const glass = isGlass(settings.material);
  const shaped = shapedSettings(settings);
  const colors = resolveSchemeColors(settings, scheme);
  const style = {
    ...localIslandFontStyle(settings),
    "--preview-fill": hexToRgba(colors.islandBackgroundColor,
      settings.opacity / 100 * (glass ? glassTintAlpha(settings.material, settings.glassIntensity) : 1)),
    "--preview-glass": settings.glassIntensity / 100,
    "--preview-radius-px": settings.islandCornerRadius,
    "--preview-radius-collapsed-px": shaped.collapsedCornerRadius,
    "--preview-corner-shape": cornerShapeCss(settings.islandCornerShape),
    "--preview-pulse": colors.pulseColor,
    "--preview-pulse-glow": hexToRgba(colors.pulseColor, 0.72),
    "--preview-pulse-brightness": `${settings.pulseBrightness}%`,
    "--preview-text": colors.taskTextColor,
    "--preview-ink": inkOn(colors.islandBackgroundColor),
    "--preview-collapsed-scale": settings.collapsedScale,
    "--preview-collapsed-width": settings.collapsedAutoWidth ? COLLAPSED_WIDTH.default : settings.collapsedWidth,
    "--preview-collapsed-height": settings.collapsedHeight,
    "--preview-collapsed-limit": COLLAPSED_WIDTH.max * MAX_COLLAPSED_SCALE,
    "--preview-expanded-scale": settings.expandedScale,
    "--preview-expanded-max-scale": MAX_EXPANDED_SCALE,
    "--preview-font-scale": settings.islandFontPercent / 100,
    "--island-font-scale": settings.islandFontPercent / 100,
  } as CSSProperties;
  const islandClass = [
    "island-preview__island",
    glass && "island-preview__island--glass",
    `island-preview__island--${settings.material}`,
    shaped.marginY > 0 && "island-preview__island--detached",
    settings.islandShape === "capsule" && "island-preview__island--capsule",
  ].filter(Boolean).join(" ");
  return { style, islandClass, tone: colors.tone };
}
