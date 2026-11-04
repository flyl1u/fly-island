import type { ScheduledTodo, TodoArchive, TodoItem } from "./types";
import type { LocalTodoKeys } from "./api";
import { readString, removeItem, writeString } from "../../lib/storage.ts";
import {
  createTodoId,
  normalizeTodo,
  parseCurrentTodoDate,
  parseScheduledTodos,
  parseTodoArchives,
  parseTodos,
} from "./normalize.ts";
import { queueTodoChange, todoFileData } from "./todoStore.ts";

export { createTodoId, normalizeTodo };

// The todo data below lives in todos.json once the island has migrated it
// (todoStore.ts); these keys are then only read for the migration and are
// never written or deleted, so an older version still finds them. Saves to
// todos.json go through the same parse functions as the migration, so todos.json
// only ever holds what the island would have read back from localStorage.

// Todos planned for later days (ScheduledTodo[]); added for upstream issue #30.
export const SCHEDULED_TODOS_STORAGE_KEY = "focusd-island-scheduled-todos";
export const TODOS_STORAGE_KEY = "focusd-island-todos";
export const ACTIVE_TODO_STORAGE_KEY = "focusd-island-active-todo";
export const TODO_DATE_STORAGE_KEY = "focusd-island-current-date";
export const TODO_ARCHIVE_STORAGE_KEY = "focusd-island-archives";
export const DAILY_NOTE_STORAGE_KEY = "focusd-island-daily-note";
/** Set once the todo keys were moved to todos.json: `{ at }`. */
export const TODOS_MIGRATED_STORAGE_KEY = "focusd-island-todos-migrated-v1";
// Settings for exporting archives; they stay in localStorage.
export const TODO_SAVE_DIRECTORY_STORAGE_KEY = "focusd-island-save-directory";
export const TODO_LAST_SAVED_SIGNATURE_STORAGE_KEY =
  "focusd-island-last-saved-signature";

/** The stored text of every migrated key, for migrate_todos. */
export function readLocalTodoKeys(): LocalTodoKeys {
  return {
    [TODOS_STORAGE_KEY]: readString(TODOS_STORAGE_KEY),
    [TODO_ARCHIVE_STORAGE_KEY]: readString(TODO_ARCHIVE_STORAGE_KEY),
    [SCHEDULED_TODOS_STORAGE_KEY]: readString(SCHEDULED_TODOS_STORAGE_KEY),
    [DAILY_NOTE_STORAGE_KEY]: readString(DAILY_NOTE_STORAGE_KEY),
    [ACTIVE_TODO_STORAGE_KEY]: readString(ACTIVE_TODO_STORAGE_KEY),
    [TODO_DATE_STORAGE_KEY]: readString(TODO_DATE_STORAGE_KEY),
  } as LocalTodoKeys;
}

export function markTodosMigrated() {
  writeString(TODOS_MIGRATED_STORAGE_KEY, JSON.stringify({ at: Date.now() }));
}

export function loadScheduledTodos(): ScheduledTodo[] {
  return todoFileData()?.scheduled ?? parseScheduledTodos(readString(SCHEDULED_TODOS_STORAGE_KEY));
}

export function saveScheduledTodos(todos: ScheduledTodo[]) {
  if (todoFileData()) queueTodoChange({ scheduled: parseScheduledTodos(JSON.stringify(todos)) });
  else writeString(SCHEDULED_TODOS_STORAGE_KEY, JSON.stringify(todos));
}

export function loadTodos(): TodoItem[] {
  return todoFileData()?.todos ?? parseTodos(readString(TODOS_STORAGE_KEY));
}

export function loadActiveTodoId() {
  const file = todoFileData();
  return file ? file.activeTodoId : readString(ACTIVE_TODO_STORAGE_KEY);
}

export function loadCurrentTodoDate() {
  return todoFileData()?.date ?? parseCurrentTodoDate(readString(TODO_DATE_STORAGE_KEY));
}

export function loadTodoArchives(): TodoArchive[] {
  return todoFileData()?.archives ?? parseTodoArchives(readString(TODO_ARCHIVE_STORAGE_KEY));
}

export function loadSaveDirectory() {
  return readString(TODO_SAVE_DIRECTORY_STORAGE_KEY) ?? "";
}

export function loadDailyNote() {
  return todoFileData()?.dailyNote ?? readString(DAILY_NOTE_STORAGE_KEY) ?? "";
}

/** Returns false when the value could not be stored. */
export function saveSaveDirectory(directory: string) {
  return writeString(TODO_SAVE_DIRECTORY_STORAGE_KEY, directory);
}

export function hasStoredSaveDirectory() {
  return readString(TODO_SAVE_DIRECTORY_STORAGE_KEY) !== null;
}

export function saveTodos(todos: TodoItem[]) {
  if (todoFileData()) queueTodoChange({ todos: parseTodos(JSON.stringify(todos)) });
  else writeString(TODOS_STORAGE_KEY, JSON.stringify(todos));
}

export function saveActiveTodoId(activeTodoId: string | null) {
  if (todoFileData()) {
    queueTodoChange({ activeTodoId: activeTodoId || null });
    return;
  }

  if (activeTodoId) {
    writeString(ACTIVE_TODO_STORAGE_KEY, activeTodoId);
    return;
  }

  removeItem(ACTIVE_TODO_STORAGE_KEY);
}

export function saveDailyNote(dailyNote: string) {
  if (todoFileData()) queueTodoChange({ dailyNote });
  else writeString(DAILY_NOTE_STORAGE_KEY, dailyNote);
}

export function saveCurrentTodoDate(date: string) {
  if (todoFileData()) queueTodoChange({ date });
  else writeString(TODO_DATE_STORAGE_KEY, date);
}

export function saveTodoArchives(archives: TodoArchive[]) {
  if (todoFileData()) queueTodoChange({ archives: parseTodoArchives(JSON.stringify(archives)) });
  else writeString(TODO_ARCHIVE_STORAGE_KEY, JSON.stringify(archives));
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
