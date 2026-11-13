import { useCallback, useEffect, useRef, useState } from "react";
import { loadTodoDurations, loadTodoTimer, saveTodoDurations, saveTodoTimer } from "./storage";
import { activeTodoTimer, createTodoTimer, isTodoDuration, isTodoTimerExpired, withTodoMinutes, type TodoDuration } from "./timer";
import type { TodoItem } from "./types";

/** Only expiration updates the notebook; the second-by-second clock lives in TodoCountdown. */
export function useTodoTimer(todos: TodoItem[], activeId: string | null, onExpired?: () => void, enabled = false) {
  const [storedTimer, setTimer] = useState(loadTodoTimer);
  const [durations, setDurations] = useState(loadTodoDurations);
  const timer = enabled ? activeTodoTimer(storedTimer, activeId, todos) : null;
  const announced = useRef<string | null>(null);

  /** The minutes this todo's watch shows and its setter starts with, kept per todo. */
  const chooseDuration = useCallback((id: string, minutes: number) => {
    if (!isTodoDuration(minutes)) return;
    const next = withTodoMinutes(durations, id, minutes, todos.map((todo) => todo.id));
    setDurations(next);
    saveTodoDurations(next);
  }, [durations, todos]);

  const startTimer = useCallback((id: string, duration: TodoDuration) => {
    if (!enabled) return true;
    if (duration !== null && !isTodoDuration(duration)) return false;
    const next = duration === null ? null : createTodoTimer(id, duration, Date.now());
    if (duration !== null && !next) return false;
    setTimer(next);
    if (duration !== null) chooseDuration(id, duration);
    return true;
  }, [chooseDuration, enabled]);

  const clearTimer = useCallback((id?: string) => {
    setTimer((current) => !id || current?.todoId === id ? null : current);
  }, []);

  useEffect(() => {
    saveTodoTimer(timer);
    if (storedTimer && !timer) setTimer(null);
  }, [storedTimer, timer]);

  useEffect(() => {
    if (!timer || timer.notified) return;
    const round = `${timer.todoId}:${timer.endsAt}`;
    const check = () => {
      if (!isTodoTimerExpired(timer, Date.now()) || announced.current === round) return;
      announced.current = round;
      const expired = { ...timer, notified: true };
      saveTodoTimer(expired);
      setTimer(expired);
      onExpired?.();
    };
    check();
    const interval = window.setInterval(check, 1000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [onExpired, timer]);

  return { timer, durations, startTimer, chooseDuration, clearTimer };
}
