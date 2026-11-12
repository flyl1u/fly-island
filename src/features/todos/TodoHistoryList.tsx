import { useState } from "react";
import { Check, ChevronDown, CornerUpLeft, History } from "lucide-react";
import { useTranslation } from "../../i18n";
import { dayHeading, hasOpenTodoTitled, splitRecentHistory, type TodoHistoryDay } from "./history";
import { TodoDayRow } from "./TodoDayRow";
import type { TodoItem } from "./types";
import "./TodoHistoryList.css";

/** Days with todos, newest first: the last week open, older days folded behind "Earlier". */
export function TodoHistoryList({
  days,
  today,
  todayTodos,
  onRestore,
}: {
  days: TodoHistoryDay[];
  today: string;
  todayTodos: TodoItem[];
  onRestore: (title: string) => void;
}) {
  const t = useTranslation();
  const [showOlder, setShowOlder] = useState(false);

  if (days.length === 0) {
    return (
      <div className="todo-history-empty">
        <History size={22} strokeWidth={1.8} aria-hidden="true" />
        <strong>{t.notebook.noHistory}</strong>
        <span>{t.notebook.noHistoryHint}</span>
      </div>
    );
  }

  const { recent, older } = splitRecentHistory(days, today);
  const renderDay = (day: TodoHistoryDay) => {
    const heading = dayHeading(day.date, today, t.notebook);
    return (
      <section key={day.date} className="todo-history__day" aria-label={heading} data-date={day.date}>
        <header className="todo-history__header">
          <span className="todo-history__heading">{heading}</span>
          <span className="todo-history__summary">
            {t.notebook.doneOf(day.doneCount, day.todos.length)}
            <span className="todo-history__bar" aria-hidden="true">
              <span style={{ width: `${(day.doneCount / day.todos.length) * 100}%` }} />
            </span>
          </span>
        </header>
        <div role="list">
          {day.todos.map((todo) => {
            const canMove = !todo.completed && day.date < today;
            const moved = canMove && hasOpenTodoTitled(todayTodos, todo.title);
            return (
              <TodoDayRow
                key={todo.id}
                title={todo.title}
                completed={todo.completed}
                action={canMove && (
                  <button
                    className="todo-day-row__button"
                    type="button"
                    disabled={moved}
                    aria-label={moved ? t.notebook.alreadyToday : t.notebook.restoreTodo(todo.title)}
                    onClick={() => onRestore(todo.title)}
                  >
                    {moved ? <Check size={12} strokeWidth={2.4} /> : <CornerUpLeft size={12} strokeWidth={2.4} />}
                    {moved ? t.notebook.alreadyToday : t.notebook.moveToToday}
                  </button>
                )}
              />
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <div className="todo-history">
      {recent.map(renderDay)}
      {older.length > 0 && (
        <button
          className={`todo-history__older${showOlder ? " todo-history__older--open" : ""}`}
          type="button"
          aria-expanded={showOlder}
          onClick={() => setShowOlder((open) => !open)}
        >
          <span>{t.notebook.olderDays(older.length)}</span>
          <ChevronDown size={14} strokeWidth={2.2} aria-hidden="true" />
        </button>
      )}
      {showOlder && older.map(renderDay)}
    </div>
  );
}
