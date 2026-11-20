/**
 * The 24 solar terms (节气), one per half-month.
 *
 * The offsets below anchor each term to 1900 and give its date within the month; the
 * formula is the usual approximation and matches the published dates for the years the
 * calendar is realistically browsed (checked against 2025–2027).
 */
const TERM_OFFSETS: readonly number[] = [
  0, 21208, 42467, 63836, 85337, 107014, 128867, 150921,
  173149, 195551, 218072, 240693, 263343, 285989, 308563, 331033,
  353350, 375494, 397447, 419210, 440795, 462224, 483532, 504758,
];

/** 小寒 first, then one term every half-month. */
const TERM_NAMES: readonly string[] = [
  "小寒", "大寒", "立春", "雨水", "惊蛰", "春分", "清明", "谷雨",
  "立夏", "小满", "芒种", "夏至", "小暑", "大暑", "立秋", "处暑",
  "白露", "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至",
];

const EPOCH = Date.UTC(1900, 0, 6, 2, 5);
const TROPICAL_YEAR_MS = 31_556_925_974.7;

function termDay(year: number, index: number) {
  return new Date(TROPICAL_YEAR_MS * (year - 1900) + TERM_OFFSETS[index] * 60_000 + EPOCH).getUTCDate();
}

/** The solar term that falls on a YYYY-MM-DD date, or null. */
export function solarTermOn(date: string): string | null {
  const [year, month, day] = date.split("-").map(Number);
  if (year < 1900 || year > 2100) return null;
  // Each month holds exactly two terms: the first at index (month - 1) * 2.
  for (const index of [(month - 1) * 2, (month - 1) * 2 + 1]) {
    if (termDay(year, index) === day) return TERM_NAMES[index];
  }
  return null;
}
