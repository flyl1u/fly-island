import { isUpdateTodo, withoutUpdateTodo } from "./updateTodo.ts";
import type { TodoArchive, TodoItem } from "./types";
import { getLocalDateString } from "../../utils/date.ts";
import { readString, removeItem, writeString } from "../../lib/storage.ts";

export const TODOS_STORAGE_KEY = "focusd-island-todos";
export const ACTIVE_TODO_STORAGE_KEY = "focusd-island-active-todo";
export const TODO_DATE_STORAGE_KEY = "focusd-island-current-date";
export const TODO_ARCHIVE_STORAGE_KEY = "focusd-island-archives";
export const DAILY_NOTE_STORAGE_KEY = "focusd-island-daily-note";
export const TODO_SAVE_DIRECTORY_STORAGE_KEY = "focusd-island-save-directory";
export const TODO_LAST_SAVED_SIGNATURE_STORAGE_KEY =
  "focusd-island-last-saved-signature";

export function normalizeTodo(todo: Partial<TodoItem>): TodoItem {
  return {
    id: typeof todo.id === "string" && todo.id ? todo.id : createTodoId(),
    title: todo.title?.trim() ?? "",
    completed: Boolean(todo.completed),
    createdAt: typeof todo.createdAt === "number" ? todo.createdAt : Date.now(),
  };
}

export function loadTodos(): TodoItem[] {
  const stored = readString(TODOS_STORAGE_KEY);

  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored) as Partial<TodoItem>[];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((todo) => typeof todo?.title === "string" && todo.title.trim() && !isUpdateTodo(todo))
      .map(normalizeTodo);
  } catch {
    return [];
  }
}

export function loadActiveTodoId() {
  return readString(ACTIVE_TODO_STORAGE_KEY);
}

export function loadCurrentTodoDate() {
  return readString(TODO_DATE_STORAGE_KEY) ?? getLocalDateString();
}

export function loadTodoArchives(): TodoArchive[] {
  const stored = readString(TODO_ARCHIVE_STORAGE_KEY);

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
                (todo) => typeof todo?.title === "string" && todo.title.trim() && !isUpdateTodo(todo),
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

export function loadSaveDirectory() {
  return readString(TODO_SAVE_DIRECTORY_STORAGE_KEY) ?? "";
}

export function loadDailyNote() {
  return readString(DAILY_NOTE_STORAGE_KEY) ?? "";
}

export function createTodoId() {
  if ("crypto" in window && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Returns false when the value could not be stored. */
export function saveSaveDirectory(directory: string) {
  return writeString(TODO_SAVE_DIRECTORY_STORAGE_KEY, directory);
}

export function hasStoredSaveDirectory() {
  return readString(TODO_SAVE_DIRECTORY_STORAGE_KEY) !== null;
}

export function saveTodos(todos: TodoItem[]) {
  writeString(TODOS_STORAGE_KEY, JSON.stringify(withoutUpdateTodo(todos)));
}

export function saveActiveTodoId(activeTodoId: string | null) {
  if (activeTodoId) {
    writeString(ACTIVE_TODO_STORAGE_KEY, activeTodoId);
    return;
  }

  removeItem(ACTIVE_TODO_STORAGE_KEY);
}

export function saveDailyNote(dailyNote: string) {
  writeString(DAILY_NOTE_STORAGE_KEY, dailyNote);
}

export function saveCurrentTodoDate(date: string) {
  writeString(TODO_DATE_STORAGE_KEY, date);
}

export function saveTodoArchives(archives: TodoArchive[]) {
  writeString(TODO_ARCHIVE_STORAGE_KEY, JSON.stringify(archives.map((archive) => ({ ...archive, todos: withoutUpdateTodo(archive.todos) }))));
}

export function loadLastSavedSignature() {
  return readString(TODO_LAST_SAVED_SIGNATURE_STORAGE_KEY);
}

export function saveLastSavedSignature(signature: string) {
  writeString(TODO_LAST_SAVED_SIGNATURE_STORAGE_KEY, signature);
}

export function clearLastSavedSignature() {
  removeItem(TODO_LAST_SAVED_SIGNATURE_STORAGE_KEY);
}
