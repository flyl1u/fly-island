export type CenteredClockSettings = {
  showTime: boolean;
  showDate: boolean;
  showSeconds: boolean;
  showWeekday: boolean;
  hourCycle: "12" | "24";
  dateFirst: boolean;
  dateFormat: string;
};

export const DEFAULT_CENTERED_CLOCK_SETTINGS: CenteredClockSettings = {
  showTime: true, showDate: false, showSeconds: false, showWeekday: false,
  hourCycle: "24", dateFirst: false, dateFormat: "YYYY-MM-DD",
};

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function normalizeCenteredClockSettings(value: unknown): CenteredClockSettings {
  const item = record(value);
  return {
    showTime: typeof item.showTime === "boolean" ? item.showTime : DEFAULT_CENTERED_CLOCK_SETTINGS.showTime,
    showDate: item.showDate === true,
    showSeconds: item.showSeconds === true,
    showWeekday: item.showWeekday === true,
    hourCycle: item.hourCycle === "12" ? "12" : "24",
    dateFirst: item.dateFirst === true,
    dateFormat: typeof item.dateFormat === "string" && item.dateFormat.trim()
      ? item.dateFormat.slice(0, 20) : DEFAULT_CENTERED_CLOCK_SETTINGS.dateFormat,
  };
}

export function formatClockDate(date: Date, format: string, locale: string): string {
  const values: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    MM: String(date.getMonth() + 1).padStart(2, "0"),
    DD: String(date.getDate()).padStart(2, "0"),
    ddd: new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date),
  };
  return format.replace(/YYYY|MM|DD|ddd/g, (token) => values[token]);
}

export type CenteredClockParts = { time: string; seconds: string; period: string; weekday: string; date: string; dateFirst: boolean };

export function getCenteredClockParts(date: Date, settings: CenteredClockSettings, locale: string): CenteredClockParts {
  const timeParts = settings.showTime ? new Intl.DateTimeFormat(locale, {
    hour: settings.hourCycle === "12" ? "numeric" : "2-digit",
    minute: "2-digit",
    hourCycle: settings.hourCycle === "12" ? "h12" : "h23",
  }).formatToParts(date) : [];
  return {
    time: timeParts.filter((part) => part.type !== "dayPeriod").map((part) => part.value).join("").trim(),
    seconds: settings.showTime && settings.showSeconds
      ? new Intl.NumberFormat(locale, { minimumIntegerDigits: 2, useGrouping: false }).format(date.getSeconds()) : "",
    period: timeParts.find((part) => part.type === "dayPeriod")?.value ?? "",
    weekday: settings.showDate && settings.showWeekday ? new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date) : "",
    date: settings.showDate ? formatClockDate(date, settings.dateFormat, locale) : "",
    dateFirst: settings.dateFirst,
  };
}

export function formatCenteredClock(date: Date, settings: CenteredClockSettings, locale: string): string {
  const parts = getCenteredClockParts(date, settings, locale);
  const time = parts.time + (parts.seconds ? `:${parts.seconds}` : "") + (parts.period ? ` ${parts.period}` : "");
  const dateText = [parts.weekday, parts.date].filter(Boolean).join(" ");
  return (parts.dateFirst ? [dateText, time] : [time, dateText]).filter(Boolean).join(" · ");
}

export function nextClockDelay(now: number, seconds: boolean): number {
  const unit = seconds ? 1_000 : 60_000;
  return unit - (now % unit);
}
