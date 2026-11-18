import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n";
import { formatTodoCountdown, remainingTodoSeconds } from "./timer";
import "./TodoCountdown.css";

/** `warning`: the round is past its reminder, so the time shows red until it ends. */
export function TodoCountdown({ endsAt, warning = false }: { endsAt: number; warning?: boolean }) {
  const t = useTranslation();
  const [seconds, setSeconds] = useState(() => remainingTodoSeconds(endsAt, Date.now()));
  useEffect(() => {
    const tick = () => setSeconds(remainingTodoSeconds(endsAt, Date.now()));
    tick();
    const interval = window.setInterval(tick, 250);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [endsAt]);
  const text = formatTodoCountdown(seconds);
  return <span className={warning ? "todo-countdown todo-countdown--warning" : "todo-countdown"} role="timer" aria-live="off" aria-label={t.todo.remainingTime(text)}>{text}</span>;
}
