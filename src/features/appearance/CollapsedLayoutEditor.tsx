import { useCallback, useLayoutEffect, useMemo, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { AudioLines, Inbox, Mail } from "lucide-react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { useTranslation } from "../../i18n";
import { moveItem } from "../../utils/order.ts";
import { WeatherIcon, clockWeatherWidth, useClockWeather } from "../weather";
import { useCenteredClock } from "../centered-clock";
import { placeCollapsedLayout, visibleCollapsedSlots } from "./collapsedLayout";
import { COLLAPSED_SLOTS } from "./settingsLimits";
import type { CollapsedSlot, IslandSettings } from "./types";
import { islandPreviewStyle } from "./islandPreviewStyle";
import { useCollapsedSlotDrag, type SlotArrangement } from "./useCollapsedSlotDrag";
import { useResolvedScheme } from "./useDocumentTheme";
import "./IslandPreview.css";
import "./CollapsedLayoutEditor.css";

const PLUGIN_SLOTS: readonly CollapsedSlot[] = ["clock", "weather"];
const NO_SLOTS: readonly CollapsedSlot[] = [];

/** Whether each icon's feature is on; a switched-off one shows grey and keeps its place. */
function slotsOn(settings: IslandSettings): Record<CollapsedSlot, boolean> {
  return {
    pulse: true,
    text: true,
    mail: settings.mailEnabled,
    shelf: settings.shelfEnabled && settings.shelfShowCount,
    music: settings.musicEnabled,
    agents: true, clock: false, weather: false,
  };
}

/**
 * Appearance → On the island: a collapsed island to arrange by hand. Hold the light, the text or a
 * status icon and drag it left or right (or press the arrow keys on it); icons left of the text sit
 * on the island's left. Dropped in the box below the island, a slot is taken off the island
 * (用户要求 2026-11-19), and dragged back it returns where it is dropped. Like the real island,
 * the agent count shows as the tuck dot while the AI Agent switch is off.
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
  const centeredClock = useCenteredClock();
  const centeredClockActive = centeredClock.installed && (centeredClock.settings.showTime || centeredClock.settings.showDate);
  // Keep plugin slots saved while absent; the centered clock takes over the old time slot while active.
  const absent = useMemo<readonly CollapsedSlot[]>(() => clockWeather.installed
    ? centeredClockActive ? ["clock"] : NO_SLOTS
    : PLUGIN_SLOTS, [centeredClockActive, clockWeather.installed]);
  const arrangement = useMemo<SlotArrangement>(() => ({
    shown: visibleCollapsedSlots(settings.collapsedLayout, settings.collapsedHidden).filter((slot) => !absent.includes(slot)),
    hidden: settings.collapsedHidden.filter((slot) => !absent.includes(slot)),
  }), [absent, settings.collapsedHidden, settings.collapsedLayout]);
  const apply = useCallback((next: SlotArrangement) => onSettingsChange({
    ...settings,
    collapsedLayout: placeCollapsedLayout(settings.collapsedLayout, next.shown, absent),
    collapsedHidden: [...next.hidden, ...settings.collapsedHidden.filter((slot) => absent.includes(slot))],
  }), [absent, onSettingsChange, settings]);
  const drag = useCollapsedSlotDrag(arrangement, apply);
  const { shown, hidden } = drag.current;
  const on = { ...slotsOn(settings), clock: clockWeather.settings.showClock && !centeredClockActive,
    weather: clockWeather.settings.showWeather && clockWeather.settings.location !== null };
  const isDefault = settings.collapsedLayout.join() === COLLAPSED_SLOTS.join() && settings.collapsedHidden.length === 0;

  // A slot moved with the keys between the island and the box is a new button: keep it focused.
  const refocus = useRef<CollapsedSlot | null>(null);
  useLayoutEffect(() => {
    const slot = refocus.current;
    refocus.current = null;
    if (slot) drag.rootRef.current?.querySelector<HTMLElement>(`[data-slot='${slot}']`)?.focus();
  });
  const moveWithKeys = (slot: CollapsedSlot, event: KeyboardEvent) => {
    const zone = hidden.includes(slot) ? "hidden" : "shown";
    const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    let next: SlotArrangement | null = null;
    if (step !== 0) {
      const moved = moveItem(drag.current[zone], slot, drag.current[zone].indexOf(slot) + step);
      if (moved !== drag.current[zone]) next = { ...drag.current, [zone]: moved };
    } else if (event.key === "ArrowDown" && zone === "shown" && slot !== "text") {
      next = { shown: shown.filter((other) => other !== slot), hidden: [...hidden, slot] };
    } else if (event.key === "ArrowUp" && zone === "hidden") {
      next = { shown: [...shown, slot], hidden: hidden.filter((other) => other !== slot) };
    } else {
      return;
    }
    event.preventDefault();
    if (!next) return;
    drag.capture();
    refocus.current = slot;
    apply(next);
  };

  const content: Record<CollapsedSlot, ReactNode> = {
    pulse: <span className="collapsed-layout__pulse" />,
    text: text.textSample,
    mail: <Mail size={15} strokeWidth={1.6} absoluteStrokeWidth />,
    shelf: <><Inbox size={13} strokeWidth={1.6} absoluteStrokeWidth />2</>,
    music: <AudioLines size={15} strokeWidth={1.6} absoluteStrokeWidth />,
    agents: settings.agentStatusEnabled ? "1" : null,
    clock: "12:34",
    weather: <><WeatherIcon code={2} />23°</>,
  };
  const slotClass = (slot: CollapsedSlot) => [
    "collapsed-layout__slot",
    `collapsed-layout__slot--${slot}`,
    slot === "agents" && !settings.agentStatusEnabled ? "collapsed-layout__slot--tuck" : "",
    on[slot] ? "" : "collapsed-layout__slot--off",
  ].filter(Boolean).join(" ");
  const slotButton = (slot: CollapsedSlot, label: string) => (
    <button key={slot} type="button" data-slot={slot} aria-label={label} onKeyDown={(event) => moveWithKeys(slot, event)}
      className={`${slotClass(slot)}${drag.ghost?.slot === slot ? " collapsed-layout__slot--placeholder" : ""}`}>
      {content[slot]}
    </button>
  );
  // The island makes room for the side space set under Collapsed island (Appearance), less the
  // slots' own 6px padding; the time and weather widen it as on the island.
  const style = {
    ...preview.style,
    "--preview-collapsed-width": clockWeatherWidth(settings.collapsedAutoWidth ? 340 : settings.collapsedWidth,
      clockWeather.installed && !centeredClockActive && !hidden.includes("clock"),
      clockWeather.installed && !hidden.includes("weather"), settings.islandFontPercent / 100),
    "--preview-side-space": Math.max(0, settings.collapsedPadding - 6),
  } as CSSProperties;

  return (
    <SettingsGroup
      title={text.title}
      action={<SettingsLinkButton disabled={isDefault} onClick={() => onSettingsChange({ ...settings, collapsedLayout: [...COLLAPSED_SLOTS], collapsedHidden: [] })}>{text.reset}</SettingsLinkButton>}
      footer={text.footer}
    >
      <div className={`collapsed-layout island-preview--font-${settings.fontFamily}${drag.ghost ? " collapsed-layout--dragging" : ""}`}
        data-tone={preview.tone} style={style} ref={drag.rootRef} {...drag.rootProps}>
        <div className={`collapsed-layout__island ${preview.islandClass} island-preview__island--collapsed`} data-zone="shown">
          {shown.map((slot) => slotButton(slot, text.moveLabel(text.slots[slot])))}
        </div>
        <div className={`collapsed-layout__hidden${drag.overHidden ? " collapsed-layout__hidden--over" : ""}`} data-drop="hidden">
          <span className="collapsed-layout__hidden-label">{hidden.length > 0 || drag.overHidden ? text.hidden : text.hiddenEmpty}</span>
          <div className="collapsed-layout__hidden-slots" data-zone="hidden">
            {hidden.map((slot) => slotButton(slot, text.hiddenLabel(text.slots[slot])))}
          </div>
        </div>
        {drag.ghost && (
          <div className={`${slotClass(drag.ghost.slot)} collapsed-layout__ghost`} aria-hidden="true"
            style={{ left: drag.ghost.left, top: drag.ghost.top, width: drag.ghost.width, height: drag.ghost.height }}>
            {content[drag.ghost.slot]}
          </div>
        )}
      </div>
      {children}
    </SettingsGroup>
  );
}
