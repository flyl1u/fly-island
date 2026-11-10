import { useCallback, type KeyboardEvent } from "react";
import { Bot, GripVertical, ListTodo, MicVocal } from "lucide-react";
import { usePointerReorder } from "../../components/reorder/usePointerReorder";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { useTranslation } from "../../i18n";
import { moveItem } from "../../utils/order.ts";
import type { CollapsedItem, IslandSettings } from "./types";
import "./CollapsedIslandSection.css";

const ICONS = { agent: Bot, lyrics: MicVocal, todo: ListTodo } as const;

/**
 * Appearance → Collapsed island: the order in which a running agent, the lyric line and a todo
 * claim the collapsed island's text (drag a row, or use the arrow keys on its handle), and
 * whether the playing song's cover shows there.
 */
export function CollapsedIslandSection({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const text = useTranslation().settings.appearance.collapsedIsland;
  const order = settings.collapsedPriority;
  const reorder = useCallback(
    (collapsedPriority: CollapsedItem[]) => onSettingsChange({ ...settings, collapsedPriority }),
    [onSettingsChange, settings],
  );
  const { containerRef, itemProps, draggingId } = usePointerReorder(order, reorder, "y");

  const moveWithKeys = (item: CollapsedItem, event: KeyboardEvent) => {
    const step = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = moveItem(order, item, order.indexOf(item) + step);
    if (next !== order) reorder(next);
  };

  return (
    <SettingsGroup title={text.title} footer={text.priorityFooter}>
      <ol className="collapsed-priority" ref={(node) => { containerRef.current = node; }}>
        {order.map((item, index) => {
          const Icon = ICONS[item];
          const { name, hint } = text.items[item];
          return (
            <li
              key={item}
              className={`collapsed-priority__item${draggingId === item ? " collapsed-priority__item--dragging" : ""}`}
              {...itemProps(item)}
            >
              <span className="collapsed-priority__rank" aria-hidden="true">{index + 1}</span>
              <Icon className="collapsed-priority__icon" size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
              <span className="collapsed-priority__text">
                <span className="collapsed-priority__name">{name}</span>
                <span className="collapsed-priority__hint">{hint}</span>
              </span>
              <button
                className="collapsed-priority__handle"
                type="button"
                aria-label={text.moveLabel(name)}
                onKeyDown={(event) => moveWithKeys(item, event)}
              >
                <GripVertical size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ol>
      <SettingsToggleRow
        title={text.showCover}
        description={text.showCoverHint}
        checked={settings.collapsedShowCover}
        onChange={(collapsedShowCover) => onSettingsChange({ ...settings, collapsedShowCover })}
      />
    </SettingsGroup>
  );
}
