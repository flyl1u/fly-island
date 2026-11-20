import claudeCodeIcon from "../../assets/brands/claude-code.png";
import { useTranslation } from "../../i18n";
import { AgentPagePreview } from "./AgentPagePreview";
import type { IslandSettings } from "./types";
import { islandPreviewStyle } from "./islandPreviewStyle";
import { useResolvedScheme } from "./useDocumentTheme";
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
  const { style, islandClass, tone } = islandPreviewStyle(settings, useResolvedScheme(settings.colorScheme));

  return (
    <figure
      className={`island-preview island-preview--font-${settings.fontFamily}`}
      data-tone={tone}
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
