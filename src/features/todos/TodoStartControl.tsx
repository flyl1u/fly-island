import type { Ref } from "react";
import { Play, Square } from "lucide-react";
import { useTranslation } from "../../i18n";
import { TodoCountdown } from "./TodoCountdown";
import type { TodoDuration, TodoTimer } from "./timer";
import type { TodoItem } from "./types";
import "./TodoStartControl.css";

/**
 * Start, or stop with the countdown. With the focus timer on, Start begins the last duration at
 * once and the pill beside it changes the duration: most rounds repeat the previous one.
 */
export function TodoStartControl({ todo, isActive, activeTimer, timerEnabled, lastDuration, choosing,
  startRef, onStart, onToggleChooser }: {
  todo: TodoItem;
  isActive: boolean;
  activeTimer: TodoTimer | null;
  timerEnabled: boolean;
  lastDuration: TodoDuration;
  choosing: boolean;
  startRef: Ref<HTMLButtonElement>;
  onStart: (id: string, duration?: TodoDuration) => void;
  onToggleChooser: () => void;
}) {
  const t = useTranslation();
  const split = timerEnabled && !isActive;
  const label = isActive ? t.todo.stop : split && lastDuration !== null ? t.todo.startFor(lastDuration) : t.todo.start;
  const start = (
    <button
      ref={startRef}
      className={["todo-start", isActive ? "todo-start--active" : "", split ? "todo-start--split" : ""]
        .filter(Boolean).join(" ")}
      type="button"
      aria-label={t.todo.actionOnTask(label, todo.title)}
      disabled={todo.completed}
      onClick={() => (split ? onStart(todo.id, lastDuration) : onStart(todo.id))}
    >
      {isActive ? <Square size={11} strokeWidth={2.4} /> : <Play size={13} strokeWidth={2.4} />}
      {activeTimer ? <TodoCountdown endsAt={activeTimer.endsAt} /> : <span>{isActive ? t.todo.stop : t.todo.start}</span>}
    </button>
  );
  if (!split) return start;
  const duration = t.todo.durationShort(lastDuration);
  return (
    <div className="todo-start-group">
      {start}
      <button
        className="todo-start-duration"
        type="button"
        aria-expanded={choosing}
        aria-label={t.todo.changeDuration(duration)}
        disabled={todo.completed}
        onClick={onToggleChooser}
      >
        {duration}
      </button>
    </div>
  );
}
