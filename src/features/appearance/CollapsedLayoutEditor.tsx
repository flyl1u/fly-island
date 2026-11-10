import { useCallback, type KeyboardEvent, type ReactNode } from "react";
import { AudioLines, Inbox, Mail } from "lucide-react";
import { usePointerReorder } from "../../components/reorder/usePointerReorder";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { useTranslation } from "../../i18n";
import { moveItem } from "../../utils/order.ts";
import { COLLAPSED_SLOTS } from "./settingsLimits";
import type { CollapsedSlot, IslandSettings } from "./types";
import "./CollapsedLayoutEditor.css";

/** Whether each icon's feature is on; a switched-off one shows grey and keeps its place. */
function slotsOn(settings: IslandSettings): Record<CollapsedSlot, boolean> {
  return {
    text: true,
    mail: settings.mailEnabled,
    shelf: settings.shelfEnabled && settings.shelfShowCount,
    music: settings.musicEnabled,
    agents: true,
  };
}

/**
 * Appearance → On the island: a collapsed island to arrange by hand. Hold the text or a status
 * icon and drag it left or right (or press the arrow keys on it); icons left of the text sit on
 * the island's left. Like the real island, the agent count shows as the tuck dot while the AI
 * Agent switch is off.
 */
export function CollapsedLayoutEditor({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const text = useTranslation().settings.appearance.collapsedIsland.layout;
  const layout = settings.collapsedLayout;
  const on = slotsOn(settings);
  const reorder = useCallback(
    (collapsedLayout: CollapsedSlot[]) => onSettingsChange({ ...settings, collapsedLayout }),
    [onSettingsChange, settings],
  );
  const { containerRef, itemProps, draggingId } = usePointerReorder(layout, reorder, "x");
  const isDefault = layout.join() === COLLAPSED_SLOTS.join();

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
  };

  return (
    <SettingsGroup
      title={text.title}
      action={<SettingsLinkButton disabled={isDefault} onClick={() => reorder([...COLLAPSED_SLOTS])}>{text.reset}</SettingsLinkButton>}
      footer={text.footer}
    >
      <div className="collapsed-layout">
        <div className="collapsed-layout__island" ref={(node) => { containerRef.current = node; }}>
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
    </SettingsGroup>
  );
}
