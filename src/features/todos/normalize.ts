import type { ScheduledTodo, TodoArchive, TodoItem } from "./types";
import { getLocalDateString } from "../../utils/date.ts";
import { normalizeScheduledTodo, sortScheduledTodos } from "./schedule.ts";

/**
 * Reads the stored text of each todo key into the current format. Pure: no
 * localStorage access, so storage.ts and the todos.json migration share it.
 * Corrupt or missing data falls back to empty values, as it always has.
 */

export function createTodoId() {
  if ("crypto" in window && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function normalizeTodo(todo: Partial<TodoItem>): TodoItem {
  return {
    id: typeof todo.id === "string" && todo.id ? todo.id : createTodoId(),
    title: todo.title?.trim() ?? "",
    completed: Boolean(todo.completed),
    createdAt: typeof todo.createdAt === "number" ? todo.createdAt : Date.now(),
  };
}

export function parseScheduledTodos(stored: string | null): ScheduledTodo[] {
  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return sortScheduledTodos(
      parsed
        .map((value) => normalizeScheduledTodo((value ?? {}) as Partial<ScheduledTodo>))
        .filter((todo): todo is ScheduledTodo => todo !== null),
    );
  } catch {
    return [];
  }
}

export function parseTodos(stored: string | null): TodoItem[] {
  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored) as Partial<TodoItem>[];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((todo) => typeof todo.title === "string" && todo.title.trim())
      .map(normalizeTodo);
  } catch {
    return [];
  }
}

export function parseCurrentTodoDate(stored: string | null) {
  return stored ?? getLocalDateString();
}

export function parseTodoArchives(stored: string | null): TodoArchive[] {
  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored) as Partial<TodoArchive>[];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((archive) => typeof archive.date === "string" && archive.date)
      .map((archive) => ({
        date: archive.date ?? getLocalDateString(),
        todos: Array.isArray(archive.todos)
          ? archive.todos
              .filter(
                (todo) => typeof todo.title === "string" && todo.title.trim(),
              )
              .map(normalizeTodo)
          : [],
        dailyNote:
          typeof archive.dailyNote === "string" ? archive.dailyNote : "",
        savedAt: typeof archive.savedAt === "number" ? archive.savedAt : 0,
        savedToDisk: Boolean(archive.savedToDisk),
        filePath:
          typeof archive.filePath === "string" ? archive.filePath : undefined,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

