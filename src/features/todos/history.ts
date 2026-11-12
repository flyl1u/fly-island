import { withoutUpdateTodo } from "./updateTodo.ts";
import type { TodoArchive, TodoItem } from "./types";

export type TodoHistoryDay = {
  /** Local date, YYYY-MM-DD. */
  date: string;
  todos: TodoItem[];
  doneCount: number;
};

/**
 * Archived days before `today` that have todos, newest first, one entry per date
 * (the first archive wins if a date was stored twice).
 */
export function groupTodoHistory(archives: TodoArchive[], today: string): TodoHistoryDay[] {
  const days = new Map<string, TodoHistoryDay>();
  for (const archive of archives) {
    if (archive.date >= today || days.has(archive.date)) continue;
    const todos = withoutUpdateTodo(archive.todos);
    if (todos.length === 0) continue;
    days.set(archive.date, {
      date: archive.date,
      todos,
      doneCount: todos.filter((todo) => todo.completed).length,
    });
  }
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** Whether today's list already has an unfinished todo with this title (after trimming). */
export function hasOpenTodoTitled(todos: TodoItem[], title: string) {
  const wanted = title.trim();
  return todos.some((todo) => !todo.completed && todo.title.trim() === wanted);
}
