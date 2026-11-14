import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { SettingsSelect } from "../../components/settings/SettingsSelect";
import { SettingsInput } from "../../components/settings/SettingsInput";
import { useTranslation } from "../../i18n";
import { IdleClock } from "./IdleClock";
import { CLOCK_DATE_FORMATS } from "./idleClockSettings";
import type { IslandSettings } from "./types";

export function IdleClockSettingsSection({ settings, onSettingsChange }: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const text = useTranslation().settings.appearance.idleClock;
  const update = (patch: Partial<IslandSettings>) => onSettingsChange({ ...settings, ...patch });
  const showsTime = settings.idleClockDisplay !== "date";
  const showsDate = settings.idleClockDisplay !== "time";
  return (
    <SettingsGroup title={text.title} footer={<>{text.hint}{settings.idleClockEnabled && <IdleClock settings={settings} />}</>}>
      <SettingsToggleRow title={text.enabled} checked={settings.idleClockEnabled} onChange={(idleClockEnabled) => update({ idleClockEnabled })} />
      {settings.idleClockEnabled && <>
        <SettingsRow title={text.display} control={<SettingsSelect value={settings.idleClockDisplay} ariaLabel={text.display}
          options={(["timeDate", "time", "date"] as const).map((value) => ({ value, label: text.displays[value] }))}
          onChange={(idleClockDisplay) => update({ idleClockDisplay })} />} />
        {showsTime && <>
          <SettingsToggleRow title={text.hour12} checked={settings.idleClockHour12} onChange={(idleClockHour12) => update({ idleClockHour12 })} />
          <SettingsToggleRow title={text.seconds} checked={settings.idleClockSeconds} onChange={(idleClockSeconds) => update({ idleClockSeconds })} />
        </>}
        {showsDate && <>
          <SettingsRow title={text.dateFormat} control={<SettingsSelect value={settings.idleClockDateFormat} ariaLabel={text.dateFormat}
            options={CLOCK_DATE_FORMATS.map((value) => ({ value, label: text.formats[value] }))}
            onChange={(idleClockDateFormat) => update({ idleClockDateFormat })} />} />
          {settings.idleClockDateFormat === "custom" && <SettingsRow title={text.custom} description={text.customHint} labelFor="idle-clock-custom">
            <SettingsInput id="idle-clock-custom" value={settings.idleClockCustomFormat} maxLength={80} monospace
              onChange={(event) => update({ idleClockCustomFormat: event.target.value })} />
          </SettingsRow>}
          <SettingsRow title={text.weekday} control={<SettingsSelect value={settings.idleClockWeekday} ariaLabel={text.weekday}
            options={(["off", "short", "long"] as const).map((value) => ({ value, label: text.weekdays[value] }))}
            onChange={(idleClockWeekday) => update({ idleClockWeekday })} />} />
        </>}
        {showsDate && showsTime && <SettingsRow title={text.order} control={<SettingsSelect value={settings.idleClockOrder} ariaLabel={text.order}
          options={(["timeFirst", "dateFirst"] as const).map((value) => ({ value, label: text.orders[value] }))}
          onChange={(idleClockOrder) => update({ idleClockOrder })} />} />}
      </>}
    </SettingsGroup>
  );
}
