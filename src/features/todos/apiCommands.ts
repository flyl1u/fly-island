import type { ScheduledTodo, TodoItem } from "./types";

/**
 * Todo and daily-note calls from the local API (see docs/local-api.md). Pure: each
 * call gets the current state and says what to change; useTodoApiHandlers applies it.
 */

export type TodoApiResult =
  | { ok: true; data: unknown }
  | { ok: false; status: 400 | 404; error: string };

export type TodoApiState = {
  date: string;
  todos: TodoItem[];
  scheduledTodos: ScheduledTodo[];
  activeTodoId: string | null;
  dailyNote: string;
};

export type TodoApiChange = {
  todos?: TodoItem[];
  dailyNote?: string;
  /** A todo for a later day, added through the scheduled list. */
  schedule?: { title: string; date: string };
};

export type TodoApiOutcome = { result: TodoApiResult; change?: TodoApiChange };

export const TODO_API_METHODS = [
  "todos.list",
  "todos.add",
  "todos.update",
  "todos.remove",
  "note.get",
  "note.set",
] as const;
export type TodoApiMethod = (typeof TODO_API_METHODS)[number];

const MAX_TITLE_LENGTH = 500;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const ok = (data: unknown): TodoApiResult => ({ ok: true, data });
const fail = (status: 400 | 404, error: string): TodoApiOutcome => ({
  result: { ok: false, status, error },
});

function asRecord(params: unknown): Record<string, unknown> {
  return params && typeof params === "object" && !Array.isArray(params)
    ? (params as Record<string, unknown>)
    : {};
}

function readTitle(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const title = value.trim();
  return title && title.length <= MAX_TITLE_LENGTH ? title : null;
}

export function runTodoApiCall(
  method: TodoApiMethod,
  params: unknown,
  state: TodoApiState,
  create: { id: string; now: number },
): TodoApiOutcome {
  const input = asRecord(params);

  switch (method) {
    case "todos.list":
      return {
        result: ok({
          date: state.date,
          todos: state.todos,
          scheduled: state.scheduledTodos,
          activeTodoId: state.activeTodoId,
        }),
      };

    case "todos.add": {
      const title = readTitle(input.title);
      if (!title) {
        return fail(400, `"title" must be a non-empty string of at most ${MAX_TITLE_LENGTH} characters.`);
      }
      const date = input.date;
      if (date !== undefined && (typeof date !== "string" || !DATE_PATTERN.test(date))) {
        return fail(400, `"date" must look like YYYY-MM-DD.`);
      }
      if (typeof date === "string" && date < state.date) {
        return fail(400, `"date" cannot be before the list's day (${state.date}).`);
      }
      if (typeof date === "string" && date > state.date) {
        return { result: ok({ title, date, scheduled: true }), change: { schedule: { title, date } } };
      }
      const todo: TodoItem = { id: create.id, title, completed: false, createdAt: create.now };
      return { result: ok(todo), change: { todos: [todo, ...state.todos] } };
    }

    case "todos.update": {
      const target = state.todos.find((todo) => todo.id === input.id);
      if (!target) {
        return fail(404, "Todo not found.");
      }
      const next = { ...target };
      if (input.title !== undefined) {
        const title = readTitle(input.title);
        if (!title) {
          return fail(400, `"title" must be a non-empty string of at most ${MAX_TITLE_LENGTH} characters.`);
        }
        next.title = title;
      }
      if (input.completed !== undefined) {
        if (typeof input.completed !== "boolean") {
          return fail(400, `"completed" must be true or false.`);
        }
        next.completed = input.completed;
      }
      return {
        result: ok(next),
        change: { todos: state.todos.map((todo) => (todo.id === next.id ? next : todo)) },
      };
    }

    case "todos.remove": {
      if (!state.todos.some((todo) => todo.id === input.id)) {
        return fail(404, "Todo not found.");
      }
      return {
        result: ok({ id: input.id }),
        change: { todos: state.todos.filter((todo) => todo.id !== input.id) },
      };
    }

    case "note.get":
      return { result: ok({ date: state.date, note: state.dailyNote }) };

    case "note.set": {
      const hasNote = typeof input.note === "string";
      const hasAppend = typeof input.append === "string";
      if (hasNote === hasAppend) {
        return fail(400, `Send either "note" (replace) or "append" (add a line), as a string.`);
      }
      const dailyNote = hasNote
        ? (input.note as string)
        : [state.dailyNote, input.append as string].filter(Boolean).join("\n");
      return { result: ok({ date: state.date, note: dailyNote }), change: { dailyNote } };
    }
  }
}
