import type { TodoItem } from "./types";
import { isUpdateTodo } from "./updateTodo.ts";

/** Keep the user's order among started, unfinished tasks. */
export function selectRotatingTodos(todos: readonly TodoItem[], activeIds: readonly string[]): TodoItem[] {
  return todos.filter((todo) => activeIds.includes(todo.id) && !todo.completed && !isUpdateTodo(todo));
}

/** A missing/removed selection starts at the first task; the last wraps to the first. */
export function nextTodoRotationIndex(ids: readonly string[], currentId: string | null): number {
  return ids.length ? (ids.indexOf(currentId ?? "") + 1) % ids.length : -1;
}
