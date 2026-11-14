export const CLOCK_DATE_FORMATS = ["monthDay", "iso", "slash", "dayFirst", "monthFirst", "long", "custom"] as const;
export type ClockDateFormat = typeof CLOCK_DATE_FORMATS[number];
export type IdleClockSettings = {
  idleClockEnabled: boolean;
  idleClockDisplay: "timeDate" | "time" | "date";
  idleClockHour12: boolean;
  idleClockSeconds: boolean;
  idleClockDateFormat: ClockDateFormat;
  idleClockWeekday: "off" | "short" | "long";
  idleClockOrder: "timeFirst" | "dateFirst";
  idleClockCustomFormat: string;
};

export const DEFAULT_IDLE_CLOCK_SETTINGS: IdleClockSettings = {
  idleClockEnabled: true,
  idleClockDisplay: "timeDate",
  idleClockHour12: false,
  idleClockSeconds: false,
  idleClockDateFormat: "monthDay",
  idleClockWeekday: "short",
  idleClockOrder: "timeFirst",
  idleClockCustomFormat: "YYYY-MM-DD",
};

export const IDLE_CLOCK_SETTING_KEYS = Object.keys(DEFAULT_IDLE_CLOCK_SETTINGS) as (keyof IdleClockSettings)[];

export function normalizeIdleClockSettings(value?: Partial<IdleClockSettings> | null): IdleClockSettings {
  const defaults = DEFAULT_IDLE_CLOCK_SETTINGS;
  return {
    idleClockEnabled: typeof value?.idleClockEnabled === "boolean" ? value.idleClockEnabled : defaults.idleClockEnabled,
    idleClockDisplay: value?.idleClockDisplay === "time" || value?.idleClockDisplay === "date" ? value.idleClockDisplay : "timeDate",
    idleClockHour12: value?.idleClockHour12 === true,
    idleClockSeconds: value?.idleClockSeconds === true,
    idleClockDateFormat: CLOCK_DATE_FORMATS.find((format) => format === value?.idleClockDateFormat) ?? defaults.idleClockDateFormat,
    idleClockWeekday: value?.idleClockWeekday === "off" || value?.idleClockWeekday === "long" ? value.idleClockWeekday : "short",
    idleClockOrder: value?.idleClockOrder === "dateFirst" ? "dateFirst" : "timeFirst",
    idleClockCustomFormat: typeof value?.idleClockCustomFormat === "string" ? value.idleClockCustomFormat.slice(0, 80) : defaults.idleClockCustomFormat,
  };
}

/** Local calendar fields only; custom patterns are replaced as text, never evaluated. */
export function formatClockDate(date: Date, settings: IdleClockSettings, locale: string) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const tokens: Record<string, string> = {
    YYYY: String(year), YY: pad(year % 100), MM: pad(month), M: String(month), DD: pad(day), D: String(day),
    ddd: new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date),
    dddd: new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date),
  };
  switch (settings.idleClockDateFormat) {
    case "iso": return `${year}-${pad(month)}-${pad(day)}`;
    case "slash": return `${year}/${pad(month)}/${pad(day)}`;
    case "dayFirst": return `${pad(day)}/${pad(month)}/${year}`;
    case "monthFirst": return `${pad(month)}/${pad(day)}/${year}`;
    case "long": return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(date);
    case "custom": return settings.idleClockCustomFormat.replace(/YYYY|dddd|ddd|YY|MM|DD|M|D/g, (token) => tokens[token]);
    default: return new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" }).format(date);
  }
}

export function formatIdleClock(date: Date, settings: IdleClockSettings, locale: string) {
  const time = settings.idleClockDisplay === "date" ? "" : new Intl.DateTimeFormat(locale, {
    hour: "2-digit", minute: "2-digit", ...(settings.idleClockSeconds ? { second: "2-digit" } : {}),
    hourCycle: settings.idleClockHour12 ? "h12" : "h23",
  }).format(date);
  const day = settings.idleClockDisplay === "time" ? "" : formatClockDate(date, settings, locale);
  // Custom ddd/dddd already supplies the weekday.
  const hasCustomWeekday = settings.idleClockDateFormat === "custom" && /ddd/.test(settings.idleClockCustomFormat);
  const weekday = settings.idleClockDisplay === "time" || settings.idleClockWeekday === "off" || hasCustomWeekday ? "" :
    new Intl.DateTimeFormat(locale, { weekday: settings.idleClockWeekday }).format(date);
  const calendar = [day, weekday].filter(Boolean).join(" ");
  return (settings.idleClockOrder === "dateFirst" ? [calendar, time] : [time, calendar]).filter(Boolean).join(" · ");
}

/** Reserve a stable width; ticks must never resize the native window. */
export function idleClockWidthText(settings: IdleClockSettings, locale: string) {
  return formatIdleClock(new Date(2026, 8, 30, 23, 58, 58), settings, locale);
}

export function idleClockTickMs(settings: IdleClockSettings) {
  return settings.idleClockSeconds && settings.idleClockDisplay !== "date" ? 1000 : 60_000;
}
