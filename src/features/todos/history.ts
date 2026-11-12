import { monthOf } from "./calendar.ts";
import { addDays } from "./schedule.ts";
import { withoutUpdateTodo } from "./updateTodo.ts";
import type { TodoArchive, TodoItem } from "./types";

export type TodoHistoryDay = {
  /** Local date, YYYY-MM-DD. */
  date: string;
  todos: TodoItem[];
  doneCount: number;
};

function toDay(date: string, items: TodoItem[]): TodoHistoryDay | null {
  const todos = withoutUpdateTodo(items);
  if (todos.length === 0) return null;
  return { date, todos, doneCount: todos.filter((todo) => todo.completed).length };
}

/**
 * Days that have todos, newest first: today's open list, then the archived days before it
 * (the first archive wins if a date was stored twice).
 */
export function groupTodoHistory(archives: TodoArchive[], today: string, todayTodos: TodoItem[] = []): TodoHistoryDay[] {
  const days = new Map<string, TodoHistoryDay>();
  const current = toDay(today, todayTodos);
  if (current) days.set(today, current);
  for (const archive of archives) {
    if (archive.date >= today || days.has(archive.date)) continue;
    const day = toDay(archive.date, archive.todos);
    if (day) days.set(archive.date, day);
  }
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** Groups the history's newest-first days without changing their order. */
export function groupHistoryByMonth(days: TodoHistoryDay[]) {
  const months = new Map<string, TodoHistoryDay[]>();
  for (const day of days) {
    const month = monthOf(day.date);
    const entries = months.get(month);
    if (entries) entries.push(day);
    else months.set(month, [day]);
  }
  return months;
}

/** "today", "yesterday" or "tomorrow" relative to `today`, or null for any other day. */
export function relativeDay(date: string, today: string): "today" | "yesterday" | "tomorrow" | null {
  if (date === today) return "today";
  if (date === addDays(today, -1)) return "yesterday";
  if (date === addDays(today, 1)) return "tomorrow";
  return null;
}

/** Whether today's list already has an unfinished todo with this title (after trimming). */
export function hasOpenTodoTitled(todos: TodoItem[], title: string) {
  const wanted = title.trim();
  return todos.some((todo) => !todo.completed && todo.title.trim() === wanted);
}

type DayHeadingText = { dayToday: string; dayYesterday: string; dayTomorrow: string; formatDay: (date: Date) => string };

/** 今天 / 昨天 / 明天, or a short date such as 11月9日 周一. */
export function dayHeading(date: string, today: string, text: DayHeadingText) {
  const relative = relativeDay(date, today);
  if (relative === "today") return text.dayToday;
  if (relative === "yesterday") return text.dayYesterday;
  if (relative === "tomorrow") return text.dayTomorrow;
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : text.formatDay(parsed);
}
