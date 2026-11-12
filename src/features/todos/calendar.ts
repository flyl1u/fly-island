import { addDays } from "./schedule.ts";
import { withoutUpdateTodo } from "./updateTodo.ts";
import type { ScheduledTodo, TodoArchive, TodoItem } from "./types";

/** A todo as the calendar shows it on its day. */
export type CalendarTodo = {
  id: string;
  title: string;
  completed: boolean;
  /** Planned for a later day and not yet on a list; it can be removed from there. */
  scheduled: boolean;
};

/** The month a date falls in, "YYYY-MM". */
export function monthOf(date: string) {
  return date.slice(0, 7);
}

export function relativeDay(date: string, today: string): "today" | "yesterday" | "tomorrow" | null {
  if (date === today) return "today";
  if (date === addDays(today, -1)) return "yesterday";
  if (date === addDays(today, 1)) return "tomorrow";
  return null;
}

type DayHeadingText = { dayToday: string; dayYesterday: string; dayTomorrow: string; formatDay: (date: Date) => string };

export function dayHeading(date: string, today: string, text: DayHeadingText) {
  const relative = relativeDay(date, today);
  if (relative === "today") return text.dayToday;
  if (relative === "yesterday") return text.dayYesterday;
  if (relative === "tomorrow") return text.dayTomorrow;
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : text.formatDay(parsed);
}

/** The month `delta` months after `month` ("YYYY-MM"). */
export function shiftMonth(month: string, delta: number) {
  const [year, monthIndex] = month.split("-").map(Number);
  const next = new Date(year, monthIndex - 1 + delta, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

/** The whole weeks, Monday first, that cover `month`: four to six rows of dates. */
export function getMonthGrid(month: string): string[] {
  const first = `${month}-01`;
  const offset = (new Date(`${first}T00:00:00`).getDay() + 6) % 7;
  const [year, monthIndex] = month.split("-").map(Number);
  const daysInMonth = new Date(year, monthIndex, 0).getDate();
  const start = addDays(first, -offset);
  return Array.from({ length: Math.ceil((offset + daysInMonth) / 7) * 7 }, (_, index) => addDays(start, index));
}

/** Up to three dots for a day: accent for open or scheduled todos, grey for done ones, open first. */
export function dayDots(items: CalendarTodo[]): ("open" | "done")[] {
  const open = items.filter((item) => !item.completed).length;
  return Array.from({ length: Math.min(items.length, 3) }, (_, index) => (index < open ? "open" : "done"));
}

/**
 * Every known todo by its day: archived lists for past days, the open list for
 * `currentDate`, and scheduled todos on the day they are planned for.
 */
export function collectCalendarTodos({
  archives,
  todos,
  currentDate,
  scheduledTodos,
}: {
  archives: TodoArchive[];
  todos: TodoItem[];
  currentDate: string;
  scheduledTodos: ScheduledTodo[];
}): Map<string, CalendarTodo[]> {
  const days = new Map<string, CalendarTodo[]>();
  const add = (date: string, items: CalendarTodo[]) => {
    if (items.length > 0) days.set(date, [...(days.get(date) ?? []), ...items]);
  };
  const fromList = (items: TodoItem[]) =>
    withoutUpdateTodo(items).map(({ id, title, completed }) => ({ id, title, completed, scheduled: false }));

  const seenArchiveDates = new Set<string>();
  for (const archive of archives) {
    if (archive.date === currentDate || seenArchiveDates.has(archive.date)) continue;
    seenArchiveDates.add(archive.date);
    add(archive.date, fromList(archive.todos));
  }
  add(currentDate, fromList(todos));
  for (const todo of scheduledTodos) {
    add(todo.date, [{ id: todo.id, title: todo.title, completed: false, scheduled: true }]);
  }
  return days;
}
