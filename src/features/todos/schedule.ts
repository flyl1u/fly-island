import { getLocalDateString } from "../../utils/date.ts";
import type { ScheduledTodo, TodoItem } from "./types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Whether `value` is a real calendar day written as YYYY-MM-DD. */
export function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && getLocalDateString(date) === value;
}

/** The local date `days` after `date` (YYYY-MM-DD), across months and DST changes. */
export function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + days);
  return getLocalDateString(next);
}

/** Scheduled todos by date, then in the order they were added. */
export function sortScheduledTodos(todos: ScheduledTodo[]) {
  return [...todos].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
}

/** Splits scheduled todos into those due on or before `date` and those still ahead. */
export function splitDueTodos(todos: ScheduledTodo[], date: string) {
  const sorted = sortScheduledTodos(todos);
  return {
    due: sorted.filter((todo) => todo.date <= date),
    later: sorted.filter((todo) => todo.date > date),
  };
}

/** Due scheduled todos as list items, earliest first at the top of the list. */
export function toTodoItems(todos: ScheduledTodo[]): TodoItem[] {
  return todos.map(({ id, title, createdAt }) => ({ id, title, completed: false, createdAt }));
}

export function normalizeScheduledTodo(value: Partial<ScheduledTodo>): ScheduledTodo | null {
  const title = typeof value.title === "string" ? value.title.trim() : "";
  if (!title || !isDateString(value.date) || typeof value.id !== "string" || !value.id) return null;
  return {
    id: value.id,
    title,
    date: value.date,
    createdAt: typeof value.createdAt === "number" ? value.createdAt : 0,
  };
}
