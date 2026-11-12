import type { CSSProperties } from "react";
import claudeCodeIcon from "../../assets/brands/claude-code.png";
import { useTranslation } from "../../i18n";
import { inkOn } from "../../utils/color";
import { AgentPagePreview } from "./AgentPagePreview";
import { cornerShapeCss } from "./cornerShape";
import { getEffectiveAppearanceMode, hexToRgba, MAX_EXPANDED_SCALE } from "./settings";
import type { IslandSettings } from "./types";
import "./IslandPreview.css";

/**
 * Appearance, first: the island drawn from the current settings, collapsed and expanded, on a
 * colourful wallpaper so opacity and glass show. Both show an Agent session, as the island does
 * while one is working: collapsed, the bar with its title and session ring; expanded, the Agent
 * page (AgentPagePreview). A drawing with sample content, not the island itself; the variables
 * mirror windows/island/stageStyle.ts, which features cannot import.
 */
export function IslandPreview({ settings }: { settings: IslandSettings }) {
  const text = useTranslation().settings.appearance.preview;
  const glass = getEffectiveAppearanceMode(settings.appearanceMode) === "liquidGlass";
  const style = {
    "--preview-fill": hexToRgba(settings.islandBackgroundColor, settings.opacity / 100),
    "--preview-glass": settings.glassIntensity / 100,
    "--preview-radius": `${settings.islandCornerRadius}px`,
    "--preview-radius-px": settings.islandCornerRadius,
    "--preview-corner-shape": cornerShapeCss(settings.islandCornerShape),
    "--preview-pulse": settings.pulseColor,
    "--preview-pulse-glow": hexToRgba(settings.pulseColor, 0.72),
    "--preview-pulse-brightness": `${settings.pulseBrightness}%`,
    "--preview-text": settings.taskTextColor,
    "--preview-ink": inkOn(settings.islandBackgroundColor),
    "--preview-collapsed-scale": settings.collapsedScale,
    "--preview-expanded-scale": settings.expandedScale,
    "--preview-expanded-max-scale": MAX_EXPANDED_SCALE,
  } as CSSProperties;
  const islandClass = [
    "island-preview__island",
    glass && "island-preview__island--glass",
    settings.marginY > 0 && "island-preview__island--detached",
  ].filter(Boolean).join(" ");

  return (
    <figure
      className={`island-preview island-preview--font-${settings.fontFamily}`}
      style={style}
      aria-label={text.label}
    >
      <div className="island-preview__desktop">
        <div className={`${islandClass} island-preview__island--collapsed`}>
          <span className="island-preview__pulse" />
          <img className="island-preview__provider" src={claudeCodeIcon} alt="" draggable={false} />
          {settings.showCollapsedText && <span className="island-preview__task">{text.sessions.needs.title}</span>}
          <span className="island-preview__ring">1</span>
        </div>
        <figcaption className="island-preview__caption">{text.collapsed}</figcaption>
      </div>
      <div className="island-preview__desktop">
        <div className={`${islandClass} island-preview__island--expanded`}>
          <AgentPagePreview pageOrder={settings.pageOrder} pageButtonStyle={settings.pageButtonStyle} />
        </div>
        <figcaption className="island-preview__caption">{text.expanded}</figcaption>
      </div>
    </figure>
  );
}
