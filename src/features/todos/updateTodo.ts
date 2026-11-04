import type { TodoItem } from "./types";
export type { TodoItem } from "./types";

export const UPDATE_TODO_ID = "focusd-island-update-todo";

export type UpdateTodoState = {
  stage: string;
  dismissed: boolean;
};

export function isUpdateTodo(todo: { kind?: "update" }): boolean {
  return todo.kind === "update";
}

/** The update todo is derived from the updater state, so it must never be
 * written to localStorage, the daily markdown file or the archive. */
export function withoutUpdateTodo(todos: TodoItem[]): TodoItem[] {
  return todos.filter((todo) => !isUpdateTodo(todo));
}

export function syncUpdateTodo(
  todos: TodoItem[],
  state: UpdateTodoState,
  title: string,
  now: number = Date.now(),
): TodoItem[] {
  const rest = withoutUpdateTodo(todos);
  // The todo says "a new version is available", so it must appear as soon as
  // the check finds one — not only after the silent download finishes.
  const shouldShow =
    !state.dismissed &&
    (state.stage === "available" ||
      state.stage === "downloading" ||
      state.stage === "ready");

  if (!shouldShow) {
    return rest.length === todos.length ? todos : rest;
  }

  // Already exactly one update todo: leave it alone so checking it off,
  // editing its title or dragging it behaves like any other todo.
  if (rest.length === todos.length - 1) {
    return todos;
  }

  return [
    {
      id: UPDATE_TODO_ID,
      title,
      completed: false,
      createdAt: now,
      kind: "update",
    },
    ...rest,
  ];
}
