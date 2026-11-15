import { addDays } from "./schedule.ts";
import { getMonthGrid, monthOf, shiftMonth } from "./calendar.ts";

/** Locale week start for the two supported languages: Monday in Chinese, Sunday in en-US. */
export function pickerWeekStart(locale: string): 0 | 1 {
  return locale.toLowerCase().startsWith("zh") ? 1 : 0;
}

export function pickerMonthGrid(month: string, weekStart: 0 | 1): string[] {
  return getMonthGrid(month, weekStart);
}

/** Moving a month keeps the day where possible (Jan 31 → Feb 28), including leap years. */
export function shiftPickerMonth(date: string, delta: number) {
  const month = shiftMonth(monthOf(date), delta);
  const [year, monthNumber] = month.split("-").map(Number);
  return `${month}-${String(Math.min(Number(date.slice(8)), new Date(year, monthNumber, 0).getDate())).padStart(2, "0")}`;
}

export function movePickerFocus(date: string, key: string, weekStart: 0 | 1, min: string): string | null {
  const weekday = (new Date(`${date}T00:00:00`).getDay() - weekStart + 7) % 7;
  const days: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -weekday, End: 6 - weekday };
  const next = key in days ? addDays(date, days[key])
    : key === "PageUp" ? shiftPickerMonth(date, -1) : key === "PageDown" ? shiftPickerMonth(date, 1) : null;
  return next === null ? null : next < min ? min : next;
}
