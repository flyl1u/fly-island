import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsInput } from "../../components/settings/SettingsInput";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSelect } from "../../components/settings/SettingsSelect";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { useTranslation } from "../../i18n";
import { CollapsedCenteredClock } from "./CollapsedCenteredClock";
import { setCenteredClockSettings, useCenteredClock } from "./useCenteredClock.ts";

export function CenteredClockSettingsGroup() {
  const { installed, settings } = useCenteredClock();
  const t = useTranslation().settings.plugins.centeredClock;
  const title = useTranslation().settings.plugins.market.items.centeredClock.name;
  if (!installed) return null;
  const update = (change: Partial<typeof settings>) => setCenteredClockSettings({ ...settings, ...change });
  return <SettingsGroup title={title} footer={t.footer}>
    <SettingsToggleRow title={t.showTime} checked={settings.showTime} onChange={(showTime) => update({ showTime })} />
    <SettingsToggleRow title={t.showDate} checked={settings.showDate} onChange={(showDate) => update({ showDate })} />
    {settings.showTime && <SettingsToggleRow title={t.showSeconds} checked={settings.showSeconds} indent onChange={(showSeconds) => update({ showSeconds })} />}
    {settings.showTime && <SettingsRow title={t.hourCycle} control={<SettingsSelect value={settings.hourCycle} ariaLabel={t.hourCycle}
      options={[{ value: "24", label: t.hour24 }, { value: "12", label: t.hour12 }]} onChange={(hourCycle) => update({ hourCycle })} />} />}
    {settings.showDate && <>
      <SettingsToggleRow title={t.showWeekday} checked={settings.showWeekday} onChange={(showWeekday) => update({ showWeekday })} />
      <SettingsRow title={t.dateFormat}>
        <SettingsInput aria-label={t.dateFormat} value={settings.dateFormat} maxLength={20}
          onChange={(event) => update({ dateFormat: event.target.value })} />
        <p className="settings-row__description">{t.dateTokens}</p>
      </SettingsRow>
      {settings.showTime && <SettingsToggleRow title={t.dateFirst} checked={settings.dateFirst} onChange={(dateFirst) => update({ dateFirst })} />}
    </>}
    <SettingsRow title={t.preview} control={<div className="centered-clock-settings-preview"><CollapsedCenteredClock active settings={settings} /></div>} />
  </SettingsGroup>;
}
