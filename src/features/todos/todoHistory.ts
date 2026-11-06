import type { ScheduledTodo, TodoArchive, TodoItem } from "./types";

/**
 * Reading other days: `todos.list { date }`, `note.get { date }` and `todos.days
 * { from, to }`. A past day is read from its archive, a later day from the scheduled
 * list. Same rules and messages as src-tauri/src/todos/history.rs.
 */

export type HistoryState = {
  date: string;
  todos: TodoItem[];
  scheduledTodos: ScheduledTodo[];
  dailyNote: string;
  archives: TodoArchive[];
};

export type HistoryAnswer = { ok: true; data: unknown } | { ok: false; status: 400 | 404; error: string };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ok = (data: unknown): HistoryAnswer => ({ ok: true, data });
const fail = (status: 400 | 404, error: string): HistoryAnswer => ({ ok: false, status, error });
const noArchive = (date: string) => fail(404, `Nothing was archived for ${date}.`);

/** The date asked for: null for today (missing, or the list's own day), or the error. */
function askedDate(value: unknown, state: HistoryState): string | null | HistoryAnswer {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return fail(400, `"date" must look like YYYY-MM-DD.`);
  return value === state.date ? null : value;
}

/** `todos.list` for another day; null means today (answered as before). */
export function listDay(value: unknown, state: HistoryState): HistoryAnswer | null {
  const date = askedDate(value, state);
  if (date === null || typeof date !== "string") return date;
  if (date > state.date) {
    return ok({ date, todos: [], scheduled: state.scheduledTodos.filter((todo) => todo.date === date), activeTodoId: null });
  }
  const archive = state.archives.find((item) => item.date === date);
  return archive ? ok({ date, todos: archive.todos, scheduled: [], activeTodoId: null, archived: true }) : noArchive(date);
}

/** `note.get` for another day; null means today. */
export function noteOfDay(value: unknown, state: HistoryState): HistoryAnswer | null {
  const date = askedDate(value, state);
  if (date === null || typeof date !== "string") return date;
  if (date > state.date) return fail(400, "A note exists only for today and archived days.");
  const archive = state.archives.find((item) => item.date === date);
  return archive ? ok({ date, note: archive.dailyNote, archived: true }) : noArchive(date);
}

/** `todos.days { from, to }`: a summary of today and each archived day in the range, oldest first. */
export function daysBetween(from: unknown, to: unknown, state: HistoryState): HistoryAnswer {
  if (typeof from !== "string" || !DATE_PATTERN.test(from) || typeof to !== "string" || !DATE_PATTERN.test(to)) {
    return fail(400, "Send { from, to } as YYYY-MM-DD dates.");
  }
  if (from > to) return fail(400, `"from" must not be after "to".`);
  const inRange = (date: string) => from <= date && date <= to;
  const summary = (date: string, todos: TodoItem[], note: string, archived: boolean) => ({
    date,
    total: todos.length,
    completed: todos.filter((todo) => todo.completed).length,
    hasNote: note.trim() !== "",
    archived,
  });
  const days = state.archives
    .filter((archive) => inRange(archive.date) && archive.date !== state.date)
    .map((archive) => summary(archive.date, archive.todos, archive.dailyNote, true));
  if (inRange(state.date)) days.push(summary(state.date, state.todos, state.dailyNote, false));
  days.sort((left, right) => left.date.localeCompare(right.date));
  return ok({ days: days.filter((day, index) => index === 0 || days[index - 1].date !== day.date) });
}
