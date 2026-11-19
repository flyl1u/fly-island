import { addDays } from "./schedule.ts";

/**
 * Statutory holidays in mainland China. The State Council publishes the next year's
 * arrangement every November; the spans and make-up workdays below follow those notices.
 * A day outside 2025–2027 gets no mark, so the calendar simply shows plain numbers there.
 *
 * Adding a year: copy its 放假 and 上班 dates from the notice into `SPANS` and `WORKDAYS`.
 */
export type HolidayMark =
  | { kind: "off"; name: string | null }
  | { kind: "work" };

/** A run of days off. `name` is a key in `notebook.holidayNames`; only the first day shows it. */
type HolidaySpan = { name: string; from: string; to?: string };

const SPANS: readonly HolidaySpan[] = [
  { name: "newYear", from: "2025-01-01" },
  { name: "springFestival", from: "2025-01-28", to: "2025-02-04" },
  { name: "qingming", from: "2025-04-04", to: "2025-04-06" },
  { name: "labour", from: "2025-05-01", to: "2025-05-05" },
  { name: "dragonBoat", from: "2025-05-31", to: "2025-06-02" },
  // National Day and Mid-Autumn fell together in 2025 and were taken as one 8-day run.
  { name: "nationalDay", from: "2025-10-01", to: "2025-10-08" },

  { name: "newYear", from: "2026-01-01", to: "2026-01-03" },
  { name: "springFestival", from: "2026-02-15", to: "2026-02-23" },
  { name: "qingming", from: "2026-04-04", to: "2026-04-06" },
  { name: "labour", from: "2026-05-01", to: "2026-05-05" },
  { name: "dragonBoat", from: "2026-06-19", to: "2026-06-21" },
  { name: "midAutumn", from: "2026-09-25", to: "2026-09-27" },
  { name: "nationalDay", from: "2026-10-01", to: "2026-10-07" },

  { name: "newYear", from: "2027-01-01", to: "2027-01-03" },
  { name: "springFestival", from: "2027-02-05", to: "2027-02-13" },
  { name: "qingming", from: "2027-04-03", to: "2027-04-05" },
  { name: "labour", from: "2027-05-01", to: "2027-05-05" },
  { name: "dragonBoat", from: "2027-06-09" },
  { name: "midAutumn", from: "2027-09-15" },
  { name: "nationalDay", from: "2027-10-01", to: "2027-10-07" },
];

/** Weekend days worked in exchange for a longer break. */
const WORKDAYS: readonly string[] = [
  "2025-01-26", "2025-02-08", "2025-04-27", "2025-09-28", "2025-10-11",
  "2026-01-04", "2026-02-14", "2026-02-28", "2026-05-09", "2026-09-20", "2026-10-10",
  "2027-01-31", "2027-02-14", "2027-05-08", "2027-09-26", "2027-10-09",
];

/** Every day from `from` to `to` inclusive, both written as YYYY-MM-DD. */
function datesBetween(from: string, to: string) {
  const days = [from];
  for (let day = from; day < to; ) {
    day = addDays(day, 1);
    days.push(day);
  }
  return days;
}

const MARKS = new Map<string, HolidayMark>();
for (const span of SPANS) {
  const days = datesBetween(span.from, span.to ?? span.from);
  days.forEach((date, index) => MARKS.set(date, { kind: "off", name: index === 0 ? span.name : null }));
}
for (const date of WORKDAYS) MARKS.set(date, { kind: "work" });

/** What the calendar prints under the number: nothing, a holiday, 休, or 班. */
export function holidayOn(date: string): HolidayMark | undefined {
  return MARKS.get(date);
}
