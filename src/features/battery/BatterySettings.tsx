import { useEffect, useState } from "react";
import { SettingsChoice } from "../../components/settings/SettingsChoice";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { useTranslation } from "../../i18n";
import { getNotebookBattery } from "./api";
import { BATTERY_DISPLAY_MODES, type BatteryPreferences } from "./preferences";

/** Settings → Plugins, once the Battery plugin is installed: what the island shows, and the chart. */
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
      <SettingsToggleRow title={t.historyTitle} description={t.historyDescription} checked={preferences.batteryHistoryEnabled}
        onChange={(batteryHistoryEnabled) => onChange({ batteryHistoryEnabled })} />
    </SettingsGroup>
  );
}
