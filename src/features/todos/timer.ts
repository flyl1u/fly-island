import type { TodoItem } from "./types";

export type TodoDuration = number | null;

/** One round, separate from TodoItem so old todo data keeps its format. */
export type TodoTimer = {
  todoId: string;
  endsAt: number;
  durationMinutes: number;
  /** Persisted before notifying, so reopening an expired round does not ring again. */
  notified: boolean;
};

export const MIN_TODO_MINUTES = 1;
export const MAX_TODO_MINUTES = 240;
/** Before any choice, and for an old "no limit": a short focus round. */
export const DEFAULT_TODO_MINUTES = 15;

export function isTodoDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
    && value >= MIN_TODO_MINUTES && value <= MAX_TODO_MINUTES;
}

export function parseTodoMinutes(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const minutes = Number(value);
  return isTodoDuration(minutes) ? minutes : null;
}

export function normalizeTodoDuration(value: unknown): TodoDuration {
  return isTodoDuration(value) ? value : null;
}

export function createTodoTimer(todoId: string, minutes: number, now: number): TodoTimer | null {
  if (!todoId || !isTodoDuration(minutes) || !Number.isSafeInteger(now) || now < 0) return null;
  const endsAt = now + minutes * 60_000;
  return Number.isSafeInteger(endsAt) ? { todoId, endsAt, durationMinutes: minutes, notified: false } : null;
}

export function normalizeTodoTimer(value: unknown): TodoTimer | null {
  if (!value || typeof value !== "object") return null;
  const timer = value as Record<string, unknown>;
  if (typeof timer.todoId !== "string" || !timer.todoId.trim()
    || typeof timer.endsAt !== "number" || !Number.isSafeInteger(timer.endsAt) || timer.endsAt <= 0
    || !isTodoDuration(timer.durationMinutes)
    || (timer.notified !== undefined && typeof timer.notified !== "boolean")) return null;
  return {
    todoId: timer.todoId,
    endsAt: timer.endsAt,
    durationMinutes: timer.durationMinutes,
    notified: timer.notified === true,
  };
}

export function activeTodoTimer(timer: TodoTimer | null, activeId: string | null, todos: TodoItem[]): TodoTimer | null {
  return timer && timer.todoId === activeId
    && todos.some((todo) => todo.id === activeId && !todo.completed && todo.kind !== "update") ? timer : null;
}

export function remainingTodoSeconds(endsAt: number, now: number): number {
  if (!Number.isFinite(endsAt) || !Number.isFinite(now)) return 0;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function isTodoTimerExpired(timer: TodoTimer, now: number): boolean {
  return now >= timer.endsAt;
}

export function formatTodoCountdown(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : 0;
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, "0")}:${String(safeSeconds % 60).padStart(2, "0")}`;
}
