import type { CSSProperties } from "react";
import { useTranslation } from "../../i18n";
import { inkOn } from "../../utils/color";
import { hexToRgba } from "./settings";
import type { IslandSettings } from "./types";
import "./IslandPreview.css";

/**
 * Appearance, first: the island drawn from the current settings, collapsed and expanded, on a
 * colourful wallpaper so opacity and glass show. A drawing with sample content, not the island
 * itself; the variables mirror windows/island/stageStyle.ts, which features cannot import.
 */
export function IslandPreview({ settings }: { settings: IslandSettings }) {
  const text = useTranslation().settings.appearance.preview;
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
    "--preview-todo-background": settings.todoBackgroundColor,
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
          <div className="island-preview__notebook">
            {text.todos.map((todo, index) => (
              <span key={todo} className={`island-preview__todo${index === 0 ? " island-preview__todo--active" : ""}`}>
                <span className="island-preview__check" />
                {todo}
              </span>
            ))}
          </div>
        </div>
        <figcaption className="island-preview__caption">{text.expanded}</figcaption>
      </div>
    </figure>
  );
}
