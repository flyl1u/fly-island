import type { CalendarEvent } from "./api";

/** A todo with no end time is taken as a half-hour meeting. */
const DEFAULT_LENGTH_MS = 30 * 60_000;

/** "15:00 周会", "9:30-10:00 站会", "14：00～15：30 评审": a time (and maybe an end) before the title. */
const LEADING_TIME = /^\s*(\d{1,2})[:：](\d{2})(?:\s*[-~～–—]\s*(\d{1,2})[:：](\d{2}))?\s+(.+)$/u;

/**
 * Today's unfinished todos whose title starts with a time, as calendar events, so the collapsed
 * island counts down to them like meetings with no calendar added. The time is local, today; a
 * join link in the title is kept. Nothing about the todos themselves changes.
 */
export function todoEvents(todos: readonly { id: string; title: string; completed: boolean }[], now: number, calendarName: string): CalendarEvent[] {
  return todos.flatMap((todo) => {
    const match = LEADING_TIME.exec(todo.title);
    if (todo.completed || !match) return [];
    const [hours, minutes] = [Number(match[1]), Number(match[2])];
    if (hours > 23 || minutes > 59) return [];
    const start = new Date(now);
    start.setHours(hours, minutes, 0, 0);
    let endMs = start.getTime() + DEFAULT_LENGTH_MS;
    if (match[3] !== undefined) {
      const end = new Date(now);
      end.setHours(Number(match[3]), Number(match[4]), 0, 0);
      if (end.getTime() > start.getTime() && Number(match[3]) <= 23 && Number(match[4]) <= 59) endMs = end.getTime();
    }
    const link = /https:\/\/\S+/u.exec(match[5])?.[0] ?? null;
    const title = match[5].replace(/https:\/\/\S+/gu, "").trim() || match[5].trim();
    return [{ uid: `todo:${todo.id}`, title, startMs: start.getTime(), endMs, allDay: false, location: null, meetingLink: link, calendar: calendarName }];
  });
}
