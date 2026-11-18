import type { TodoItem } from "./types";

export type TodoDuration = number | null;

/** One round, separate from TodoItem so old todo data keeps its format. */
export type TodoTimer = {
  todoId: string;
  endsAt: number;
  durationMinutes: number;
  /** Persisted before notifying, so reopening an expired round does not ring again. */
  notified: boolean;
  /**
   * Minutes before the end to remind (Settings → Todos → remind before the end); absent in rounds
   * saved by older versions and in rounds started without a reminder.
   */
  remindMinutes?: number;
  /** Persisted once the reminder fired, like `notified`; the round then shows as ending soon. */
  reminded?: boolean;
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

/** Each todo keeps its own minutes; one todo's choice is never another's default. */
export type TodoDurations = Readonly<Record<string, number>>;

export function normalizeTodoDurations(value: unknown): TodoDurations {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, minutes]) => id && isTodoDuration(minutes)));
}

export function todoMinutes(durations: TodoDurations, id: string): number {
  const minutes = Object.prototype.hasOwnProperty.call(durations, id) ? durations[id] : undefined;
  return isTodoDuration(minutes) ? minutes : DEFAULT_TODO_MINUTES;
}

/** Sets one todo's minutes and drops todos that no longer exist, so the record stays small. */
export function withTodoMinutes(durations: TodoDurations, id: string, minutes: number, todoIds: readonly string[]): TodoDurations {
  const kept = Object.entries(durations).filter(([key]) => key !== id && todoIds.includes(key));
  return Object.fromEntries([...kept, [id, minutes]]);
}

export function createTodoTimer(todoId: string, minutes: number, now: number, remindMinutes = 0): TodoTimer | null {
  if (!todoId || !isTodoDuration(minutes) || !Number.isSafeInteger(now) || now < 0) return null;
  const endsAt = now + minutes * 60_000;
  if (!Number.isSafeInteger(endsAt)) return null;
  const timer: TodoTimer = { todoId, endsAt, durationMinutes: minutes, notified: false };
  return isRemindMinutes(remindMinutes, minutes) ? { ...timer, remindMinutes, reminded: false } : timer;
}

/** The reminder choices: 1 to 60 minutes, and less than the round itself; 0 is no reminder. */
export const MAX_REMIND_MINUTES = 60;
export const DEFAULT_REMIND_MINUTES = 5;

export function isRemindMinutes(value: unknown, durationMinutes: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1
    && value <= MAX_REMIND_MINUTES && value < durationMinutes;
}

/** Whether the round is past its reminder and not yet over: its title flashes, its time turns red. */
export function isTodoTimerEndingSoon(timer: TodoTimer): boolean {
  return timer.reminded === true && !timer.notified;
}

/** Whether the reminder is due now: in the last `remindMinutes`, before the end, not yet fired. */
export function isTodoReminderDue(timer: TodoTimer, now: number): boolean {
  return isRemindMinutes(timer.remindMinutes, timer.durationMinutes) && !timer.reminded && !timer.notified
    && now >= timer.endsAt - timer.remindMinutes * 60_000 && now < timer.endsAt;
}

/** Turning reminders off cancels this round's reminder without stopping its countdown. */
export function withoutTodoReminder(timer: TodoTimer): TodoTimer {
  if (timer.remindMinutes === undefined && timer.reminded === undefined) return timer;
  const { todoId, endsAt, durationMinutes, notified } = timer;
  return { todoId, endsAt, durationMinutes, notified };
}

export function normalizeTodoTimer(value: unknown): TodoTimer | null {
  if (!value || typeof value !== "object") return null;
  const timer = value as Record<string, unknown>;
  if (typeof timer.todoId !== "string" || !timer.todoId.trim()
    || typeof timer.endsAt !== "number" || !Number.isSafeInteger(timer.endsAt) || timer.endsAt <= 0
    || !isTodoDuration(timer.durationMinutes)
    || (timer.notified !== undefined && typeof timer.notified !== "boolean")) return null;
  const normalized: TodoTimer = {
    todoId: timer.todoId,
    endsAt: timer.endsAt,
    durationMinutes: timer.durationMinutes,
    notified: timer.notified === true,
  };
  return isRemindMinutes(timer.remindMinutes, timer.durationMinutes)
    ? { ...normalized, remindMinutes: timer.remindMinutes, reminded: timer.reminded === true } : normalized;
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
