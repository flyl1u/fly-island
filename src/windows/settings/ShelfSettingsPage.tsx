import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsNumberRow } from "../../components/settings/SettingsNumberRow";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSelect } from "../../components/settings/SettingsSelect";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { MAX_SHELF_ITEMS, MIN_SHELF_ITEMS, SHELF_CLEANUP_DAYS } from "../../features/appearance/settings";
import type { IslandSettings, ShelfDoubleClick } from "../../features/appearance/types";
import { useTranslation } from "../../i18n";
import { ModuleSwitchSection } from "./ModuleSwitchSection";

/** File shelf: how dropping and opening files works, then when files leave the shelf. */
export function ShelfSettingsPage({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();
  const labels = t.settings.fileShelf;
  const update = (patch: Partial<IslandSettings>) => onSettingsChange({ ...settings, ...patch });
  const cleanupOptions = SHELF_CLEANUP_DAYS.map((days) => ({
    value: String(days),
    label: days === 0 ? labels.cleanupNever : labels.cleanupDays(days),
  }));
  const doubleClickOptions = [
    { value: "open", label: labels.doubleClickOpen },
    { value: "reveal", label: labels.doubleClickReveal },
  ] as const;

  return (
    <>
      <ModuleSwitchSection
        label={t.settings.modules.shelf}
        checked={settings.shelfEnabled}
        onChange={(shelfEnabled) => update({ shelfEnabled })}
      />
      {settings.shelfEnabled && (
        <SettingsGroup title={labels.title}>
          <SettingsToggleRow
            title={labels.expandOnDrop}
            description={settings.shelfExpandOnDrop ? undefined : labels.expandOnDropHint}
            checked={settings.shelfExpandOnDrop}
            onChange={(shelfExpandOnDrop) => update({ shelfExpandOnDrop })}
          />
          <SettingsRow
            title={labels.doubleClick}
            control={
              <SettingsSelect<ShelfDoubleClick>
                value={settings.shelfDoubleClick}
                options={doubleClickOptions}
                ariaLabel={labels.doubleClick}
                onChange={(shelfDoubleClick) => update({ shelfDoubleClick })}
              />
            }
          />
          <SettingsToggleRow title={labels.showCount} checked={settings.shelfShowCount} onChange={(shelfShowCount) => update({ shelfShowCount })} />
        </SettingsGroup>
      )}
      {settings.shelfEnabled && (
        <SettingsGroup title={labels.cleanupTitle} footer={labels.cleanupHint}>
          <SettingsRow
            title={labels.autoCleanup}
            control={
              <SettingsSelect
                value={String(settings.shelfAutoCleanupDays)}
                options={cleanupOptions}
                ariaLabel={labels.autoCleanup}
                onChange={(days) => update({ shelfAutoCleanupDays: Number(days) })}
              />
            }
          />
          <SettingsToggleRow title={labels.removeMissing} checked={settings.shelfRemoveMissing} onChange={(shelfRemoveMissing) => update({ shelfRemoveMissing })} />
          <SettingsToggleRow
            title={labels.removeAfterDragOut}
            checked={settings.shelfRemoveAfterDragOut}
            onChange={(shelfRemoveAfterDragOut) => update({ shelfRemoveAfterDragOut })}
          />
          <SettingsNumberRow
            title={labels.maxItems}
            value={settings.shelfMaxItems}
            min={MIN_SHELF_ITEMS}
            max={MAX_SHELF_ITEMS}
            onChange={(shelfMaxItems) => update({ shelfMaxItems })}
          />
        </SettingsGroup>
      )}
    </>
  );
}
