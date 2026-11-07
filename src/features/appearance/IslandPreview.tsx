import type { CSSProperties } from "react";
import { useTranslation } from "../../i18n";
import { inkOn } from "../../utils/color";
import { hexToRgba } from "./settings";
import type { IslandSettings } from "./types";
import "./IslandPreview.css";

/** A product name, the same in every language. */
const SAMPLE_MODEL = "Opus 5.5";

function SessionTitle({ project, title }: { project: string; title: string }) {
  return (
    <span className="island-preview__session-title">
      <span className="island-preview__session-project">{project} · </span>
      {title}
    </span>
  );
}

/**
 * Appearance, first: the island drawn from the current settings, collapsed and expanded, on a
 * colourful wallpaper so opacity and glass show. Expanded, it shows the Agent page's session list
 * (AgentSessionsPanel), whose dots are the session lights. A drawing with sample content, not the
 * island itself; the variables mirror windows/island/stageStyle.ts, which features cannot import.
 */
export function IslandPreview({ settings }: { settings: IslandSettings }) {
  const text = useTranslation().settings.appearance.preview;
  const sessions = text.sessions;
  const glass = settings.appearanceMode === "liquidGlass";
  const style = {
    "--preview-fill": hexToRgba(settings.islandBackgroundColor, settings.opacity / 100),
    "--preview-glass": settings.glassIntensity / 100,
    "--preview-radius": `${settings.islandCornerRadius}px`,
    "--preview-corner-shape": settings.islandCornerShape,
    "--preview-pulse": settings.pulseColor,
    "--preview-pulse-glow": hexToRgba(settings.pulseColor, 0.72),
    "--preview-pulse-brightness": `${settings.pulseBrightness}%`,
    "--preview-text": settings.taskTextColor,
    "--preview-ink": inkOn(settings.islandBackgroundColor),
    "--preview-collapsed-scale": settings.collapsedScale,
    "--preview-expanded-scale": settings.expandedScale,
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
          {settings.showCollapsedText && <span className="island-preview__task">{text.task}</span>}
          {settings.showIdleTodoCount && <span className="island-preview__count">3</span>}
        </div>
        <figcaption className="island-preview__caption">{text.collapsed}</figcaption>
      </div>
      <div className="island-preview__desktop">
        <div className={`${islandClass} island-preview__island--expanded`}>
          <div className="island-preview__sessions">
            <span className="island-preview__session island-preview__session--working">
              <span className="island-preview__session-dot" />
              <span className="island-preview__session-main">
                <span className="island-preview__session-heading">
                  <SessionTitle {...sessions.running} />
                  <span className="island-preview__session-model">{SAMPLE_MODEL}</span>
                </span>
                <span className="island-preview__session-line">{sessions.running.reply}</span>
              </span>
            </span>
            <span className="island-preview__session island-preview__session--your-turn">
              <span className="island-preview__session-dot" />
              <span className="island-preview__session-main">
                <SessionTitle {...sessions.yourTurn} />
                <span className="island-preview__session-line island-preview__session-line--status">{sessions.yourTurn.status}</span>
              </span>
            </span>
            <span className="island-preview__session island-preview__session--done">
              <span className="island-preview__session-dot" />
              <SessionTitle {...sessions.done} />
              <span className="island-preview__session-age">{sessions.done.age}</span>
            </span>
          </div>
        </div>
        <figcaption className="island-preview__caption">{text.expanded}</figcaption>
      </div>
    </figure>
  );
}
