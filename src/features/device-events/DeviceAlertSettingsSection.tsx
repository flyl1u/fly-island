import { useTranslation } from "../../i18n";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import type { IslandSettings } from "../appearance/types";

/** Settings → General: headphone, Bluetooth battery and charger alerts on the collapsed island. */
export function DeviceAlertSettingsSection({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const text = useTranslation().settings.deviceAlerts;

  return (
    <SettingsGroup title={text.title}>
      <SettingsToggleRow
        title={text.alerts}
        description={text.alertsHint}
        checked={settings.deviceAlerts}
        onChange={(deviceAlerts) => onSettingsChange({ ...settings, deviceAlerts })}
      />
    </SettingsGroup>
  );
}
