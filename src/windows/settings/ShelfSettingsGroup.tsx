import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSelect } from "../../components/settings/SettingsSelect";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { SHELF_CLEANUP_DAYS } from "../../features/appearance/settings";
import type { IslandSettings } from "../../features/appearance/types";
import { useTranslation } from "../../i18n";

/**
 * The file shelf's group on the Clipboard page (it had a page of its own): its switch and when
 * files leave it. Dropping, double-clicking and the other shelf rules keep their defaults.
 */
export function ShelfSettingsGroup({
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

  return (
    <SettingsGroup title={t.settings.categories.shelf} footer={settings.shelfEnabled ? labels.cleanupHint : t.settings.modules.hint}>
      <SettingsToggleRow title={t.settings.modules.shelf} checked={settings.shelfEnabled} onChange={(shelfEnabled) => update({ shelfEnabled })} />
      {settings.shelfEnabled && (
        <SettingsRow
          indent
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
      )}
    </SettingsGroup>
  );
}
