import type { ScheduledTodo, TodoArchive, TodoItem } from "./types";
import { readString, removeItem, writeString } from "../../lib/storage.ts";
import {
  createTodoId,
  normalizeTodo,
  parseCurrentTodoDate,
  parseScheduledTodos,
  parseTodoArchives,
  parseTodos,
} from "./normalize.ts";

export { createTodoId, normalizeTodo };

// Todos planned for later days (ScheduledTodo[]); added for upstream issue #30.
export const SCHEDULED_TODOS_STORAGE_KEY = "focusd-island-scheduled-todos";

export function loadScheduledTodos(): ScheduledTodo[] {
  return parseScheduledTodos(readString(SCHEDULED_TODOS_STORAGE_KEY));
}

export function saveScheduledTodos(todos: ScheduledTodo[]) {
  writeString(SCHEDULED_TODOS_STORAGE_KEY, JSON.stringify(todos));
}

export const TODOS_STORAGE_KEY = "focusd-island-todos";
export const ACTIVE_TODO_STORAGE_KEY = "focusd-island-active-todo";
export const TODO_DATE_STORAGE_KEY = "focusd-island-current-date";
export const TODO_ARCHIVE_STORAGE_KEY = "focusd-island-archives";
export const DAILY_NOTE_STORAGE_KEY = "focusd-island-daily-note";
export const TODO_SAVE_DIRECTORY_STORAGE_KEY = "focusd-island-save-directory";
export const TODO_LAST_SAVED_SIGNATURE_STORAGE_KEY =
  "focusd-island-last-saved-signature";

export function loadTodos(): TodoItem[] {
  return parseTodos(readString(TODOS_STORAGE_KEY));
}

export function loadActiveTodoId() {
  return readString(ACTIVE_TODO_STORAGE_KEY);
}

export function loadCurrentTodoDate() {
  return parseCurrentTodoDate(readString(TODO_DATE_STORAGE_KEY));
}

export function loadTodoArchives(): TodoArchive[] {
  return parseTodoArchives(readString(TODO_ARCHIVE_STORAGE_KEY));
}

export function loadSaveDirectory() {
  return readString(TODO_SAVE_DIRECTORY_STORAGE_KEY) ?? "";
}

export function loadDailyNote() {
  return readString(DAILY_NOTE_STORAGE_KEY) ?? "";
}

/** Returns false when the value could not be stored. */
export function saveSaveDirectory(directory: string) {
  return writeString(TODO_SAVE_DIRECTORY_STORAGE_KEY, directory);
}

export function hasStoredSaveDirectory() {
  return readString(TODO_SAVE_DIRECTORY_STORAGE_KEY) !== null;
}

export function saveTodos(todos: TodoItem[]) {
  writeString(TODOS_STORAGE_KEY, JSON.stringify(todos));
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
  writeString(TODO_ARCHIVE_STORAGE_KEY, JSON.stringify(archives));
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
