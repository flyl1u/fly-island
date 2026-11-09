/** "HH:MM" as minutes after midnight, or null when it is not a valid time. */
export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

/**
 * Whether `now` falls between `start` and `end` ("HH:MM"). An end earlier than the start runs
 * past midnight; equal times or an invalid one mean no quiet hours.
 */
export function isQuietTime(now: Date, start: string, end: string): boolean {
  const from = parseClock(start);
  const to = parseClock(end);
  if (from === null || to === null || from === to) return false;
  const minute = now.getHours() * 60 + now.getMinutes();
  return from < to ? minute >= from && minute < to : minute >= from || minute < to;
}
