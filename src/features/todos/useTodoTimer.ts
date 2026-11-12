import { useCallback, useEffect, useRef, useState } from "react";
import { loadTodoDuration, loadTodoTimer, saveTodoDuration, saveTodoTimer } from "./storage";
import { activeTodoTimer, createTodoTimer, isTodoDuration, isTodoTimerExpired, type TodoDuration } from "./timer";
import type { TodoItem } from "./types";

/** Only expiration updates the notebook; the second-by-second clock lives in TodoCountdown. */
export function useTodoTimer(todos: TodoItem[], activeId: string | null, onExpired?: () => void) {
  const [storedTimer, setTimer] = useState(loadTodoTimer);
  const [lastDuration, setLastDuration] = useState(loadTodoDuration);
  const timer = activeTodoTimer(storedTimer, activeId, todos);
  const announced = useRef<string | null>(null);

  const startTimer = useCallback((id: string, duration: TodoDuration) => {
    if (duration !== null && !isTodoDuration(duration)) return false;
    const next = duration === null ? null : createTodoTimer(id, duration, Date.now());
    if (duration !== null && !next) return false;
    setTimer(next);
    setLastDuration(duration);
    saveTodoDuration(duration);
    return true;
  }, []);

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

  return { timer, lastDuration, startTimer, clearTimer };
}
