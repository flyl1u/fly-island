import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadTodoDurations, loadTodoTimers, saveTodoDurations, saveTodoTimers } from "./storage";
import { createTodoTimer, isTodoDuration, isTodoTimerExpired, withTodoMinutes, type TodoDuration } from "./timer";
import type { TodoItem } from "./types";

/** Independent rounds; only expiration re-renders the notebook. */
export function useTodoTimer(todos: TodoItem[], activeIds: string[], onExpired?: () => void, enabled = false) {
  const [storedTimers, setTimers] = useState(loadTodoTimers);
  const [durations, setDurations] = useState(loadTodoDurations);
  const announced = useRef(new Set<string>());
  const timers = useMemo(() => enabled ? storedTimers.filter((timer) => activeIds.includes(timer.todoId)
    && todos.some((todo) => todo.id === timer.todoId && !todo.completed && todo.kind !== "update")) : [], [activeIds, enabled, storedTimers, todos]);
  const timer = timers.find((round) => round.todoId === activeIds[0]) ?? null;

  const chooseDuration = useCallback((id: string, minutes: number) => {
    if (!isTodoDuration(minutes)) return;
    const next = withTodoMinutes(durations, id, minutes, todos.map((todo) => todo.id));
    setDurations(next);
    saveTodoDurations(next);
  }, [durations, todos]);

  const startTimer = useCallback((id: string, duration: TodoDuration, multiple = false) => {
    if (!enabled) return true;
    if (duration !== null && !isTodoDuration(duration)) return false;
    const next = duration === null ? null : createTodoTimer(id, duration, Date.now());
    if (duration !== null && !next) return false;
    setTimers((current) => [...(multiple ? current.filter((round) => round.todoId !== id) : []), ...(next ? [next] : [])]);
    if (duration !== null) chooseDuration(id, duration);
    return true;
  }, [chooseDuration, enabled]);

  const clearTimer = useCallback((id?: string) => {
    setTimers((current) => id ? current.filter((round) => round.todoId !== id) : []);
  }, []);

  useEffect(() => {
    saveTodoTimers(timers, activeIds[0] ?? null);
    if (timers.length !== storedTimers.length) setTimers(timers);
  }, [storedTimers, activeIds, timers]);

  useEffect(() => {
    const present = new Set(timers.map((round) => `${round.todoId}:${round.endsAt}`));
    announced.current = new Set([...announced.current].filter((key) => present.has(key)));
    if (!timers.some((round) => !round.notified)) return;
    const check = () => {
      const expired = timers.filter((round) => !round.notified && isTodoTimerExpired(round, Date.now())
        && !announced.current.has(`${round.todoId}:${round.endsAt}`));
      if (!expired.length) return;
      const keys = new Set(expired.map((round) => `${round.todoId}:${round.endsAt}`));
      for (const key of keys) announced.current.add(key);
      const next = timers.map((round) => announced.current.has(`${round.todoId}:${round.endsAt}`) ? { ...round, notified: true } : round);
      saveTodoTimers(next, activeIds[0] ?? null);
      setTimers((current) => current.map((round) => keys.has(`${round.todoId}:${round.endsAt}`) ? { ...round, notified: true } : round));
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
  }, [onExpired, activeIds, timers]);

  return { timer, timers, durations, startTimer, chooseDuration, clearTimer };
}
