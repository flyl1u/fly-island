import { useEffect, useState } from "react";
import { SettingsChoice } from "../../components/settings/SettingsChoice";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { useTranslation } from "../../i18n";
import { getNotebookBattery } from "./api";
import { BATTERY_DISPLAY_MODES, BATTERY_READOUT_STYLES, type BatteryPreferences } from "./preferences";

export function BatterySettings({ preferences, onChange }: {
  preferences: BatteryPreferences;
  onChange: (patch: Partial<BatteryPreferences>) => void;
}) {
  const t = useTranslation().battery;
  // A desktop PC installs the plugin and sees nothing on the island; say why.
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let disposed = false;
    void getNotebookBattery(false).then((snapshot) => { if (!disposed) setMissing(snapshot === null); }).catch(() => {});
    return () => { disposed = true; };
  }, []);

  return (
    <SettingsGroup title={t.name} footer={missing ? t.noBattery : undefined}>
      <SettingsRow title={t.displayMode} control={
        <SettingsChoice ariaLabel={t.displayMode} value={preferences.batteryDisplayMode}
          options={BATTERY_DISPLAY_MODES.map((value) => ({ value, label: t.displayOptions[value] }))}
          onChange={(batteryDisplayMode) => onChange({ batteryDisplayMode })} />
      } />
      <SettingsRow title={t.readoutStyle} description={t.readoutStyleDescription} control={
        <SettingsChoice ariaLabel={t.readoutStyle} value={preferences.batteryReadoutStyle}
          options={BATTERY_READOUT_STYLES.map((value) => ({ value, label: t.readoutStyleOptions[value] }))}
          onChange={(batteryReadoutStyle) => onChange({ batteryReadoutStyle })} />
      } />
      <SettingsToggleRow title={t.historyTitle} description={t.historyDescription} checked={preferences.batteryHistoryEnabled}
        onChange={(batteryHistoryEnabled) => onChange({ batteryHistoryEnabled })} />
    </SettingsGroup>
  );
}
