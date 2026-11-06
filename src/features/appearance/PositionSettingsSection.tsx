import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSliderRow } from "../../components/settings/SettingsSliderRow";
import { useTranslation } from "../../i18n";
import { DEFAULT_SETTINGS } from "./settings";
import type { IslandSettings } from "./types";

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

  return (
    <SettingsGroup title={t.settings.position.title} footer={t.settings.position.moveHint}>
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
