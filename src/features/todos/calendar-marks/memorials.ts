/**
 * Fixed-date national days and observances. Statutory holidays and their make-up workdays
 * live in holidays.ts; these are the days that do not close offices.
 *
 * Keys are a date's month and day, values are keys in `notebook.memorialNames`.
 */
const DAYS: Readonly<Record<string, string>> = {
  "01-10": "policeDay",
  "03-05": "leiFengDay",
  "03-08": "womensDay",
  "03-12": "arborDay",
  "03-15": "consumerDay",
  "04-22": "earthDay",
  "05-04": "youthDay",
  "05-12": "disasterDay",
  "06-01": "childrensDay",
  "06-05": "environmentDay",
  "07-01": "partyDay",
  "08-01": "armyDay",
  "09-03": "victoryDay",
  "09-10": "teachersDay",
  "12-04": "constitutionDay",
  "12-13": "memorialDay",
};

/** The observance falling on a YYYY-MM-DD date, as an i18n key, or null. */
export function memorialOn(date: string): string | null {
  return DAYS[date.slice(5)] ?? null;
}
