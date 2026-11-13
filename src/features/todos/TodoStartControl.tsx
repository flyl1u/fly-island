import { useEffect, useRef, useState, type Ref } from "react";
import { Play, Square, Timer } from "lucide-react";
import { useTranslation } from "../../i18n";
import { TodoCountdown } from "./TodoCountdown";
import { TodoDurationPicker } from "./TodoDurationPicker";
import type { TodoDuration, TodoTimer } from "./timer";
import type { TodoItem } from "./types";
import "./TodoStartControl.css";

/**
 * Start, or stop with the countdown. With the focus timer on, a watch sits left of Start: Start
 * always counts down the chosen minutes, and the watch opens a small setter above to change them.
 */
export function TodoStartControl({ todo, isActive, activeTimer, timerEnabled, minutes, startRef, onStart,
  onDurationChange }: {
  todo: TodoItem;
  isActive: boolean;
  activeTimer: TodoTimer | null;
  timerEnabled: boolean;
  minutes: number;
  startRef: Ref<HTMLButtonElement>;
  onStart: (id: string, duration?: TodoDuration) => void;
  onDurationChange: (minutes: number) => void;
}) {
  const t = useTranslation();
  const [choosing, setChoosing] = useState(false);
  const watch = useRef<HTMLButtonElement>(null);
  const timed = timerEnabled && !isActive && !todo.completed;
  useEffect(() => {
    if (!timed) setChoosing(false);
  }, [timed]);

  const label = isActive ? t.todo.stop : timed ? t.todo.startFor(minutes) : t.todo.start;
  const start = (
    <button
      ref={startRef}
      className={isActive ? "todo-start todo-start--active" : "todo-start"}
      type="button"
      aria-label={t.todo.actionOnTask(label, todo.title)}
      disabled={todo.completed}
      onClick={() => (timed ? onStart(todo.id, minutes) : onStart(todo.id))}
    >
      {isActive ? <Square size={11} strokeWidth={2.4} /> : <Play size={13} strokeWidth={2.4} />}
      {activeTimer ? <TodoCountdown endsAt={activeTimer.endsAt} /> : <span>{isActive ? t.todo.stop : t.todo.start}</span>}
    </button>
  );
  if (!timed) return start;
  return (
    <div className="todo-start-group">
      <button
        ref={watch}
        className="todo-timer-button"
        type="button"
        aria-expanded={choosing}
        aria-label={t.todo.changeDuration(minutes)}
        title={t.todo.changeDuration(minutes)}
        onClick={() => setChoosing((current) => !current)}
      >
        <Timer size={14} strokeWidth={2.2} />
      </button>
      {start}
      {choosing && (
        <TodoDurationPicker
          anchor={watch}
          minutes={minutes}
          onChange={onDurationChange}
          onStart={(chosen) => { setChoosing(false); onStart(todo.id, chosen); }}
          onClose={(refocus) => { setChoosing(false); if (refocus) watch.current?.focus(); }}
        />
      )}
    </div>
  );
}
