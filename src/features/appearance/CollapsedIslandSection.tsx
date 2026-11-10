import { useCallback } from "react";
import { Bot, ListTodo, MicVocal } from "lucide-react";
import { ReorderList } from "../../components/reorder/ReorderList";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { useTranslation } from "../../i18n";
import type { CollapsedItem, IslandSettings } from "./types";

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

  return (
    <SettingsGroup title={text.title} footer={text.priorityFooter}>
      <ReorderList
        rows={order.map((item) => {
          const Icon = ICONS[item];
          return {
            id: item,
            ...text.items[item],
            icon: <Icon className="reorder-list__icon" size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />,
          };
        })}
        onReorder={reorder}
        moveLabel={text.moveLabel}
      />
      <SettingsToggleRow
        title={text.showCover}
        description={text.showCoverHint}
        checked={settings.collapsedShowCover}
        onChange={(collapsedShowCover) => onSettingsChange({ ...settings, collapsedShowCover })}
      />
    </SettingsGroup>
  );
}
