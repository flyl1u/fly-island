import { withoutUpdateTodo } from "./updateTodo.ts";
import type { ScheduledTodo, TodoArchive, TodoItem } from "./types";
import { readJson, readString, removeItem, writeJson, writeString } from "../../lib/storage.ts";
import { DEFAULT_REMIND_MINUTES, MAX_REMIND_MINUTES, normalizeTodoDurations, normalizeTodoTimer, type TodoDurations, type TodoTimer } from "./timer.ts";
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
export const TODOS_STORAGE_KEY = "focusd-island-todos";
export const ACTIVE_TODO_STORAGE_KEY = "focusd-island-active-todo";
export const TODO_TIMER_STORAGE_KEY = "focusd-island-todo-timer";
export const ACTIVE_TODOS_STORAGE_KEY = "focusd-island-active-todos";
export const TODO_TIMERS_STORAGE_KEY = "focusd-island-todo-timers";
// 旧的 "focusd-island-todo-duration"（所有待办共用一个时长）已不再读取：每项待办各自记时长。
export const TODO_DURATIONS_STORAGE_KEY = "focusd-island-todo-durations";
// v3.2.6: minutes before the end the last reminder was asked for (0: none), the next round's default.
export const TODO_REMIND_MINUTES_STORAGE_KEY = "focusd-island-todo-remind-minutes";
export const TODO_DATE_STORAGE_KEY = "focusd-island-current-date";
export const TODO_ARCHIVE_STORAGE_KEY = "focusd-island-archives";
export const DAILY_NOTE_STORAGE_KEY = "focusd-island-daily-note";
// Settings for exporting archives; they stay in localStorage.
export const TODO_SAVE_DIRECTORY_STORAGE_KEY = "focusd-island-save-directory";
export const TODO_LAST_SAVED_SIGNATURE_STORAGE_KEY =
  "focusd-island-last-saved-signature";

export function loadScheduledTodos(): ScheduledTodo[] {
  return parseScheduledTodos(readString(SCHEDULED_TODOS_STORAGE_KEY));
}

export function saveScheduledTodos(todos: ScheduledTodo[]) {
  writeString(SCHEDULED_TODOS_STORAGE_KEY, JSON.stringify(todos));
}

export function loadTodos(): TodoItem[] {
  return parseTodos(readString(TODOS_STORAGE_KEY));
}

export function loadActiveTodoId() {
  return readString(ACTIVE_TODO_STORAGE_KEY);
}

export function loadActiveTodoIds(): string[] {
  const saved = readJson(ACTIVE_TODOS_STORAGE_KEY);
  if (Array.isArray(saved)) return [...new Set(saved.filter((id): id is string => typeof id === "string" && id.trim().length > 0))];
  const legacy = loadActiveTodoId();
  return legacy ? [legacy] : [];
}

export function saveActiveTodoIds(ids: string[]) {
  writeJson(ACTIVE_TODOS_STORAGE_KEY, ids);
  saveActiveTodoId(ids[0] ?? null);
}

export function loadTodoTimers(): TodoTimer[] {
  const saved = readJson(TODO_TIMERS_STORAGE_KEY);
  if (Array.isArray(saved)) return saved.map(normalizeTodoTimer).filter((timer): timer is TodoTimer => timer !== null)
    .filter((timer, index, timers) => timers.findIndex((other) => other.todoId === timer.todoId) === index);
  const legacy = loadTodoTimer();
  return legacy ? [legacy] : [];
}

export function saveTodoTimers(timers: TodoTimer[], primaryId: string | null) {
  writeJson(TODO_TIMERS_STORAGE_KEY, timers);
  saveTodoTimer(timers.find((timer) => timer.todoId === primaryId) ?? null);
}

export function loadTodoTimer() {
  return normalizeTodoTimer(readJson(TODO_TIMER_STORAGE_KEY));
}

export function saveTodoTimer(timer: TodoTimer | null) {
  return timer ? writeJson(TODO_TIMER_STORAGE_KEY, timer) : removeItem(TODO_TIMER_STORAGE_KEY);
}

export function loadTodoDurations(): TodoDurations {
  return normalizeTodoDurations(readJson(TODO_DURATIONS_STORAGE_KEY));
}

export function saveTodoDurations(durations: TodoDurations) {
  return writeJson(TODO_DURATIONS_STORAGE_KEY, durations);
}

/** The reminder the last round asked for, 0 to 60 minutes; the default before any choice. */
export function loadTodoRemindMinutes(): number {
  const saved = readJson(TODO_REMIND_MINUTES_STORAGE_KEY);
  return typeof saved === "number" && Number.isInteger(saved) && saved >= 0 && saved <= MAX_REMIND_MINUTES ? saved : DEFAULT_REMIND_MINUTES;
}

export function saveTodoRemindMinutes(minutes: number) {
  return writeJson(TODO_REMIND_MINUTES_STORAGE_KEY, minutes);
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
