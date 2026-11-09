import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSelect } from "../../components/settings/SettingsSelect";
import { SettingsSliderRow } from "../../components/settings/SettingsSliderRow";
import { useTranslation } from "../../i18n";
import { DEFAULT_SETTINGS } from "./settings";
import type { IslandMonitor, IslandSettings } from "./types";

/** Where the island sits: its top margin, how to drag it, and a way back to the default. */
export function PositionSettingsSection({
  settings,
  onSettingsChange,
  onResetPosition,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
  onResetPosition: () => void;
}) {
  const t = useTranslation();
  const monitorOptions = (["primary", "cursor", "foreground"] as const).map((value) => ({ value, label: t.settings.position.monitorOptions[value] }));

  return (
    <SettingsGroup title={t.settings.position.title} footer={`${t.settings.position.monitorHint} ${t.settings.position.moveHint}`}>
      <SettingsRow
        title={t.settings.position.monitor}
        control={
          <SettingsSelect<IslandMonitor>
            value={settings.islandMonitor}
            options={monitorOptions}
            ariaLabel={t.settings.position.monitor}
            onChange={(islandMonitor) => onSettingsChange({ ...settings, islandMonitor })}
          />
        }
      />
      <SettingsSliderRow
        title={t.settings.layout.marginY}
        value={settings.marginY}
        min={0}
        max={160}
        step={1}
        format={(value) => `${Math.round(value)} px`}
        defaultValue={DEFAULT_SETTINGS.marginY}
        resetLabel={t.settings.layout.resetToDefault}
        onChange={(marginY) => onSettingsChange({ ...settings, marginY })}
      />
      <SettingsRow
        title={t.settings.position.resetRow}
        control={<SettingsLinkButton onClick={onResetPosition}>{t.settings.position.reset}</SettingsLinkButton>}
      />
    </SettingsGroup>
  );
}
