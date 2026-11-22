import { addDays } from "../schedule.ts";

/**
 * Mainland China holiday and make-up workday notices. 维护步骤见 docs/holidays.md。
 *
 * Each year lists the days off and the weekends worked. Every day inside a break is marked
 * off, and only its first day carries the holiday's name. A day outside the years here is
 * left to the regular weekend and date captions.
 */
export type HolidayMark =
  | { kind: "off"; name: string | null }
  | { kind: "work" };

/** A run of days off. `name` is a key in the calendar marks translations; omit `to` for a single day. */
export type Break = { name: string; from: string; to?: string };

/** One year exactly as its notice reads: 放假区间 plus 调休上班的周末. */
export type YearPlan = {
  breaks: readonly Break[];
  workdays: readonly string[];
};

const PLANS: Readonly<Record<number, YearPlan>> = {
  2025: {
    breaks: [
      { name: "newYear", from: "2025-01-01" },
      { name: "springFestival", from: "2025-01-28", to: "2025-02-04" },
      { name: "qingming", from: "2025-04-04", to: "2025-04-06" },
      { name: "labour", from: "2025-05-01", to: "2025-05-05" },
      { name: "dragonBoat", from: "2025-05-31", to: "2025-06-02" },
      // 国庆与中秋连在一起，按一个 8 天假期处理。
      { name: "nationalDay", from: "2025-10-01", to: "2025-10-08" },
    ],
    workdays: ["2025-01-26", "2025-02-08", "2025-04-27", "2025-09-28", "2025-10-11"],
  },
  2026: {
    breaks: [
      { name: "newYear", from: "2026-01-01", to: "2026-01-03" },
      { name: "springFestival", from: "2026-02-15", to: "2026-02-23" },
      { name: "qingming", from: "2026-04-04", to: "2026-04-06" },
      { name: "labour", from: "2026-05-01", to: "2026-05-05" },
      { name: "dragonBoat", from: "2026-06-19", to: "2026-06-21" },
      { name: "midAutumn", from: "2026-09-25", to: "2026-09-27" },
      { name: "nationalDay", from: "2026-10-01", to: "2026-10-07" },
    ],
    workdays: ["2026-01-04", "2026-02-14", "2026-02-28", "2026-05-09", "2026-09-20", "2026-10-10"],
  },
  2027: {
    breaks: [
      { name: "newYear", from: "2027-01-01", to: "2027-01-03" },
      { name: "springFestival", from: "2027-02-05", to: "2027-02-13" },
      { name: "qingming", from: "2027-04-03", to: "2027-04-05" },
      { name: "labour", from: "2027-05-01", to: "2027-05-05" },
      { name: "dragonBoat", from: "2027-06-09" },
      { name: "midAutumn", from: "2027-09-15" },
      { name: "nationalDay", from: "2027-10-01", to: "2027-10-07" },
    ],
    workdays: ["2027-01-31", "2027-02-14", "2027-05-08", "2027-09-26", "2027-10-09"],
  },
};

/** Years with data. The maintenance test walks these and expects the six fixed holidays. */
export const COVERED_YEARS: readonly number[] = Object.keys(PLANS).map(Number);

/** The raw plan for a year. The maintenance test reads it to catch overlapping entries. */
export function yearPlan(year: number): YearPlan | undefined {
  return PLANS[year];
}

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
for (const plan of Object.values(PLANS)) {
  for (const span of plan.breaks) {
    const days = datesBetween(span.from, span.to ?? span.from);
    days.forEach((date, index) => MARKS.set(date, { kind: "off", name: index === 0 ? span.name : null }));
  }
  for (const date of plan.workdays) MARKS.set(date, { kind: "work" });
}

/** The official status for a date, if the notice lists it. */
export function holidayOn(date: string): HolidayMark | undefined {
  return MARKS.get(date);
}
