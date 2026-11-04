import { NumberControl } from "../../components/controls/NumberControl";
import { SelectControl } from "../../components/controls/SelectControl";
import { ToggleControl } from "../../components/controls/ToggleControl";
import { MAX_SHELF_ITEMS, MIN_SHELF_ITEMS, SHELF_CLEANUP_DAYS } from "../../features/appearance/settings";
import type { IslandSettings, ShelfDoubleClick } from "../../features/appearance/types";
import { useTranslation } from "../../i18n";
import { ModuleSwitchSection } from "./ModuleSwitchSection";
import "./ShelfSettingsPage.css";

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
  const doubleClickOptions: { value: ShelfDoubleClick; label: string }[] = [
    { value: "open", label: labels.doubleClickOpen },
    { value: "reveal", label: labels.doubleClickReveal },
  ];

  return (
    <>
      <ModuleSwitchSection
        label={t.settings.modules.shelf}
        checked={settings.shelfEnabled}
        onChange={(shelfEnabled) => update({ shelfEnabled })}
      />
      {settings.shelfEnabled && (
        <section className="settings-section settings-section--shelf">
          <div className="settings-section__header">
            <span>{labels.title}</span>
          </div>
          <ToggleControl
            label={labels.expandOnDrop}
            checked={settings.shelfExpandOnDrop}
            onChange={(shelfExpandOnDrop) => update({ shelfExpandOnDrop })}
          />
          {!settings.shelfExpandOnDrop && <p className="settings-section__hint">{labels.expandOnDropHint}</p>}
          <div className="shelf-settings__row">
            <span>{labels.doubleClick}</span>
            <SelectControl
              value={settings.shelfDoubleClick}
              options={doubleClickOptions}
              ariaLabel={labels.doubleClick}
              onChange={(shelfDoubleClick) => update({ shelfDoubleClick })}
            />
          </div>
          <ToggleControl
            label={labels.showCount}
            checked={settings.shelfShowCount}
            onChange={(shelfShowCount) => update({ shelfShowCount })}
          />
          <div className="shelf-settings__row">
            <span>{labels.autoCleanup}</span>
            <SelectControl
              value={String(settings.shelfAutoCleanupDays)}
              options={cleanupOptions}
              ariaLabel={labels.autoCleanup}
              onChange={(days) => update({ shelfAutoCleanupDays: Number(days) })}
            />
          </div>
          <ToggleControl
            label={labels.removeMissing}
            checked={settings.shelfRemoveMissing}
            onChange={(shelfRemoveMissing) => update({ shelfRemoveMissing })}
          />
          <ToggleControl
            label={labels.removeAfterDragOut}
            checked={settings.shelfRemoveAfterDragOut}
            onChange={(shelfRemoveAfterDragOut) => update({ shelfRemoveAfterDragOut })}
          />
          <NumberControl
            label={labels.maxItems}
            value={settings.shelfMaxItems}
            min={MIN_SHELF_ITEMS}
            max={MAX_SHELF_ITEMS}
            onChange={(shelfMaxItems) => update({ shelfMaxItems })}
          />
          <p className="settings-section__hint">{labels.cleanupHint}</p>
        </section>
      )}
    </>
  );
}
