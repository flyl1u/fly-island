import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadTodoDurations, loadTodoTimers, saveTodoDurations, saveTodoTimers } from "./storage";
import { createTodoTimer, isTodoDuration, isTodoReminderDue, isTodoTimerExpired, withoutTodoReminder, withTodoMinutes, type TodoDuration, type TodoTimer } from "./timer";
import type { TodoItem } from "./types";

/**
 * Independent rounds; only expiration, and a round's reminder before its end (`onReminder`, with
 * the round), re-render the notebook.
 */
export function useTodoTimer(todos: TodoItem[], activeIds: string[], onExpired?: () => void, enabled = false, onReminder?: (round: TodoTimer) => void, remindersEnabled = false) {
  const [storedTimers, setTimers] = useState(loadTodoTimers);
  const [durations, setDurations] = useState(loadTodoDurations);
  const announced = useRef(new Set<string>());
  const timers = useMemo(() => enabled ? storedTimers.filter((timer) => activeIds.includes(timer.todoId))
    .map((round) => remindersEnabled ? round : withoutTodoReminder(round)) : [], [activeIds, enabled, remindersEnabled, storedTimers]);
  const timer = timers.find((round) => round.todoId === activeIds[0]) ?? null;

  const chooseDuration = useCallback((id: string, minutes: number) => {
    if (!isTodoDuration(minutes)) return;
    const next = withTodoMinutes(durations, id, minutes, todos.map((todo) => todo.id));
    setDurations(next);
    saveTodoDurations(next);
  }, [durations, todos]);

  const startTimer = useCallback((id: string, duration: TodoDuration, remindMinutes = 0) => {
    if (!enabled) return true;
    if (duration !== null && !isTodoDuration(duration)) return false;
    const next = duration === null ? null : createTodoTimer(id, duration, Date.now(), remindersEnabled ? remindMinutes : 0);
    if (duration !== null && !next) return false;
    setTimers((current) => [...current.filter((round) => round.todoId !== id), ...(next ? [next] : [])]);
    if (duration !== null) chooseDuration(id, duration);
    return true;
  }, [chooseDuration, enabled, remindersEnabled]);

  const clearTimer = useCallback((id: string) => {
    setTimers((current) => current.filter((round) => round.todoId !== id));
  }, []);

  useEffect(() => {
    saveTodoTimers(timers, activeIds[0] ?? null);
    if (timers.length !== storedTimers.length || timers.some((round, index) => round !== storedTimers[index])) setTimers(timers);
  }, [storedTimers, activeIds, timers]);

  useEffect(() => {
    const present = new Set(timers.map((round) => `${round.todoId}:${round.endsAt}`));
    announced.current = new Set([...announced.current].filter((key) => present.has(key.replace(/^remind:/, ""))));
    if (!timers.some((round) => !round.notified)) return;
    const check = () => {
      const due = timers.filter((round) => isTodoReminderDue(round, Date.now()) && !announced.current.has(`remind:${round.todoId}:${round.endsAt}`));
      if (due.length) {
        const dueKeys = new Set(due.map((round) => `${round.todoId}:${round.endsAt}`));
        for (const key of dueKeys) announced.current.add(`remind:${key}`);
        const marked = (round: TodoTimer) => dueKeys.has(`${round.todoId}:${round.endsAt}`) ? { ...round, reminded: true } : round;
        saveTodoTimers(timers.map(marked), activeIds[0] ?? null);
        setTimers((current) => current.map(marked));
        for (const round of due) onReminder?.(round);
        return;
      }
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
  }, [onExpired, onReminder, activeIds, timers]);

  return { timer, timers, durations, startTimer, chooseDuration, clearTimer };
}
