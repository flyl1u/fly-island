import { useMemo, useState } from "react";
import { Check, ChevronDown, CornerUpLeft, History } from "lucide-react";
import { useTranslation } from "../../i18n";
import { monthOf } from "./calendar";
import { dayHeading, groupHistoryByMonth, hasOpenTodoTitled, type TodoHistoryDay } from "./history";
import { TodoDayDetail } from "./TodoDayDetail";
import { TodoDayRow } from "./TodoDayRow";
import type { TodoItem } from "./types";
import "./TodoHistoryList.css";

/** Browse the dates with tasks by month, with only the chosen day's tasks open. */
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const months = useMemo(() => groupHistoryByMonth(days), [days]);
  const formatMonth = useMemo(() => new Intl.DateTimeFormat(t.localeTag, {
    year: "numeric",
    month: "short",
  }), [t.localeTag]);
  const selected = days.find((day) => day.date === selectedDate) ?? days[0];

  if (!selected) {
    return (
      <div className="todo-history-empty">
        <History size={22} strokeWidth={1.8} aria-hidden="true" />
        <strong>{t.notebook.noHistory}</strong>
        <span>{t.notebook.noHistoryHint}</span>
      </div>
    );
  }

  const month = monthOf(selected.date);
  const dates = months.get(month) ?? [];

  return (
    <div className="todo-date-overview todo-history">
      <nav className="todo-date-overview__sidebar" aria-label={t.notebook.historyDates}>
        <div className="todo-history__month">
          <select
            value={month}
            aria-label={t.notebook.historyMonth}
            onChange={(event) => {
              const first = months.get(event.currentTarget.value)?.[0];
              if (first) setSelectedDate(first.date);
            }}
          >
            {[...months.keys()].map((value) => {
              const date = new Date(`${value}-01T00:00:00`);
              return <option key={value} value={value}>{Number.isNaN(date.getTime()) ? value : formatMonth.format(date)}</option>;
            })}
          </select>
          <ChevronDown size={14} strokeWidth={2.2} aria-hidden="true" />
        </div>
        <ul key={month} className="todo-history__dates">
          {dates.map((day) => {
            const heading = dayHeading(day.date, today, t.notebook);
            return (
              <li key={day.date}>
                <button
                  className="todo-history__date"
                  type="button"
                  aria-pressed={day.date === selected.date}
                  aria-current={day.date === today ? "date" : undefined}
                  aria-label={t.notebook.dayTodos(heading, day.todos.length)}
                  data-date={day.date}
                  onClick={() => setSelectedDate(day.date)}
                >
                  <span className="todo-history__date-label">{heading}</span>
                  <span className="todo-history__date-count" aria-hidden="true">{day.todos.length}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <TodoDayDetail date={selected.date} today={today} summary={t.notebook.doneOf(selected.doneCount, selected.todos.length)}>
        {selected.todos.map((todo) => {
          const canMove = !todo.completed && selected.date < today;
          const moved = canMove && hasOpenTodoTitled(todayTodos, todo.title);
          const actionLabel = moved ? t.notebook.alreadyToday : t.notebook.moveToToday;
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
                  title={actionLabel}
                  onClick={() => onRestore(todo.title)}
                >
                  {moved ? <Check size={12} strokeWidth={2.4} aria-hidden="true" /> : <CornerUpLeft size={12} strokeWidth={2.4} aria-hidden="true" />}
                  <span className="todo-day-row__button-label">{actionLabel}</span>
                </button>
              )}
            />
          );
        })}
      </TodoDayDetail>
    </div>
  );
}
