import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n";
import { formatTodoCountdown, remainingTodoSeconds } from "./timer";
import "./TodoCountdown.css";

export function TodoCountdown({ endsAt }: { endsAt: number }) {
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
  return <span className="todo-countdown" role="timer" aria-live="off" aria-label={t.todo.remainingTime(text)}>{text}</span>;
}
