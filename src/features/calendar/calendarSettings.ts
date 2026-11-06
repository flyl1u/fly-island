/** Minutes before a meeting that the collapsed island starts counting down; 0 turns it off. */
export const CALENDAR_REMIND_MINUTES = [0, 5, 10, 15, 30] as const;
export type CalendarRemindMinutes = (typeof CALENDAR_REMIND_MINUTES)[number];

/** The calendar settings kept with the island's settings (Settings → Calendar). */
export type CalendarSettingValues = {
  /** The calendar module; the page also needs a calendar added to show. */
  calendarEnabled: boolean;
  calendarRemindMinutes: CalendarRemindMinutes;
  /** The collapsed countdown names the meeting; off says only "Meeting". */
  calendarShowTitle: boolean;
};

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettingValues = {
  calendarEnabled: true,
  calendarRemindMinutes: 10,
  calendarShowTitle: true,
};

/** Saved calendar settings with anything missing or malformed set back to the default. */
export function normalizeCalendarSettings(saved: Partial<Record<keyof CalendarSettingValues, unknown>> | null | undefined): CalendarSettingValues {
  const minutes = saved?.calendarRemindMinutes;
  return {
    calendarEnabled: saved?.calendarEnabled !== false,
    calendarRemindMinutes: (CALENDAR_REMIND_MINUTES as readonly unknown[]).includes(minutes)
      ? (minutes as CalendarRemindMinutes)
      : DEFAULT_CALENDAR_SETTINGS.calendarRemindMinutes,
    calendarShowTitle: saved?.calendarShowTitle !== false,
  };
}
