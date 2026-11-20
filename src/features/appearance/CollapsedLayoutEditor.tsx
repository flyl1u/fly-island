import { useCallback, type KeyboardEvent, type ReactNode } from "react";
import { AudioLines, Inbox, Mail } from "lucide-react";
import { usePointerReorder } from "../../components/reorder/usePointerReorder";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { useTranslation } from "../../i18n";
import { moveItem } from "../../utils/order.ts";
import { WeatherIcon, clockWeatherWidth, useClockWeather } from "../weather";
import { mergeVisibleCollapsedLayout } from "./collapsedLayout";
import { COLLAPSED_SLOTS } from "./settingsLimits";
import type { CollapsedSlot, IslandSettings } from "./types";
import { islandPreviewStyle } from "./islandPreviewStyle";
import { useResolvedScheme } from "./useDocumentTheme";
import "./IslandPreview.css";
import "./CollapsedLayoutEditor.css";

/** Whether each icon's feature is on; a switched-off one shows grey and keeps its place. */
function slotsOn(settings: IslandSettings): Record<CollapsedSlot, boolean> {
  return {
    text: true,
    mail: settings.mailEnabled,
    shelf: settings.shelfEnabled && settings.shelfShowCount,
    music: settings.musicEnabled,
    agents: true, clock: false, weather: false,
  };
}

/**
 * Appearance → On the island: a collapsed island to arrange by hand. Hold the text or a status
 * icon and drag it left or right (or press the arrow keys on it); icons left of the text sit on
 * the island's left. Like the real island, the agent count shows as the tuck dot while the AI
 * Agent switch is off.
 */
export function CollapsedLayoutEditor({
  children,
  settings,
  onSettingsChange,
}: {
  /** More rows of the same group, after the editor (Appearance puts the page buttons here). */
  children?: ReactNode;
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const text = useTranslation().settings.appearance.collapsedIsland.layout;
  const preview = islandPreviewStyle(settings, useResolvedScheme(settings.colorScheme));
  const clockWeather = useClockWeather();
  const layout = settings.collapsedLayout.filter((slot) => clockWeather.installed || (slot !== "clock" && slot !== "weather"));
  const on = { ...slotsOn(settings), clock: clockWeather.settings.showClock,
    weather: clockWeather.settings.showWeather && clockWeather.settings.location !== null };
  const reorder = useCallback(
    (visible: CollapsedSlot[]) => onSettingsChange({ ...settings, collapsedLayout: visible.length === COLLAPSED_SLOTS.length
      ? visible : mergeVisibleCollapsedLayout(settings.collapsedLayout, visible) }),
    [onSettingsChange, settings],
  );
  const { containerRef, itemProps, draggingId } = usePointerReorder(layout, reorder, "x", true);
  const isDefault = settings.collapsedLayout.join() === COLLAPSED_SLOTS.join();

  const moveWithKeys = (slot: CollapsedSlot, event: KeyboardEvent) => {
    const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = moveItem(layout, slot, layout.indexOf(slot) + step);
    if (next !== layout) reorder(next);
  };

  const content: Record<CollapsedSlot, ReactNode> = {
    text: <><span className="collapsed-layout__pulse" />{text.textSample}</>,
    mail: <Mail size={15} strokeWidth={1.6} absoluteStrokeWidth />,
    shelf: <><Inbox size={13} strokeWidth={1.6} absoluteStrokeWidth />2</>,
    music: <AudioLines size={15} strokeWidth={1.6} absoluteStrokeWidth />,
    agents: settings.agentStatusEnabled ? "1" : null,
    clock: "12:34",
    weather: <><WeatherIcon code={2} />23°</>,
  };

  return (
    <SettingsGroup
      title={text.title}
      action={<SettingsLinkButton disabled={isDefault} onClick={() => reorder([...COLLAPSED_SLOTS])}>{text.reset}</SettingsLinkButton>}
      footer={text.footer}
    >
      <div className={`collapsed-layout island-preview--font-${settings.fontFamily}`} data-tone={preview.tone} style={{ ...preview.style, "--preview-collapsed-width": clockWeatherWidth(
        settings.collapsedAutoWidth ? 340 : settings.collapsedWidth, clockWeather.installed, clockWeather.installed,
        settings.islandFontPercent / 100) } as import("react").CSSProperties}>
        <div className={`collapsed-layout__island ${preview.islandClass} island-preview__island--collapsed`} ref={(node) => { containerRef.current = node; }}>
          {layout.map((slot) => (
            <button
              key={slot}
              type="button"
              className={[
                "collapsed-layout__slot",
                `collapsed-layout__slot--${slot}`,
                slot === "agents" && !settings.agentStatusEnabled ? "collapsed-layout__slot--tuck" : "",
                on[slot] ? "" : "collapsed-layout__slot--off",
                draggingId === slot ? "collapsed-layout__slot--dragging" : "",
              ].filter(Boolean).join(" ")}
              aria-label={text.moveLabel(text.slots[slot])}
              onKeyDown={(event) => moveWithKeys(slot, event)}
              {...itemProps(slot)}
            >
              {content[slot]}
            </button>
          ))}
        </div>
      </div>
      {children}
    </SettingsGroup>
  );
}
