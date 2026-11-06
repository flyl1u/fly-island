import { useTranslation } from "../../i18n";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import type { IslandSettings } from "../appearance/types";

/** Settings → General: the camera and microphone indicator on the collapsed island. */
export function DeviceUseSettingsSection({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const text = useTranslation().settings.deviceUse;

  return (
    <SettingsGroup title={text.title}>
      <SettingsToggleRow
        title={text.indicator}
        description={text.indicatorHint}
        checked={settings.deviceUseIndicator}
        onChange={(deviceUseIndicator) => onSettingsChange({ ...settings, deviceUseIndicator })}
      />
    </SettingsGroup>
  );
}
