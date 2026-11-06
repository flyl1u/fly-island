import type { IslandSettings } from "../../features/appearance/types";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSelect } from "../../components/settings/SettingsSelect";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { CalendarSourcesSection } from "../../features/calendar/CalendarSourcesSection";
import { CALENDAR_REMIND_MINUTES, type CalendarRemindMinutes } from "../../features/calendar/calendarSettings";
import { useTranslation } from "../../i18n";
import { ModuleSwitchSection } from "./ModuleSwitchSection";

/** Settings → Calendar: the module switch, the countdown on the collapsed island, and the calendars. */
export function CalendarSettingsPage({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();
  const text = t.settings.calendar;

  return (
    <>
      <ModuleSwitchSection
        label={t.settings.modules.calendar}
        checked={settings.calendarEnabled}
        onChange={(calendarEnabled) => onSettingsChange({ ...settings, calendarEnabled })}
      />
      {settings.calendarEnabled && (
        <>
          <SettingsGroup title={text.island}>
            <SettingsRow
              title={text.remind}
              description={text.remindHint}
              control={
                <SettingsSelect
                  value={String(settings.calendarRemindMinutes)}
                  ariaLabel={text.remind}
                  options={CALENDAR_REMIND_MINUTES.map((minutes) => ({ value: String(minutes), label: text.remindOption(minutes) }))}
                  onChange={(value) => onSettingsChange({ ...settings, calendarRemindMinutes: Number(value) as CalendarRemindMinutes })}
                />
              }
            />
            {settings.calendarRemindMinutes > 0 && (
              <SettingsToggleRow
                indent
                title={text.showTitle}
                description={text.showTitleHint}
                checked={settings.calendarShowTitle}
                onChange={(calendarShowTitle) => onSettingsChange({ ...settings, calendarShowTitle })}
              />
            )}
          </SettingsGroup>
          <CalendarSourcesSection />
        </>
      )}
    </>
  );
}
