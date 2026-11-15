import type { TodoItem } from "./types";
import { isUpdateTodo } from "./updateTodo.ts";

/** Keep the user's order, ignoring completed tasks and the derived update reminder. */
export function selectRotatingTodos(todos: readonly TodoItem[], count: number): TodoItem[] {
  const limit = Number.isFinite(count) ? Math.max(1, Math.min(10, Math.round(count))) : 3;
  return todos.filter((todo) => !todo.completed && !isUpdateTodo(todo)).slice(0, limit);
}

/** A missing/removed selection starts at the first task; the last wraps to the first. */
export function nextTodoRotationIndex(ids: readonly string[], currentId: string | null): number {
  return ids.length ? (ids.indexOf(currentId ?? "") + 1) % ids.length : -1;
}
