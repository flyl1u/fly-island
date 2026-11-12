import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { useTranslation } from "../../i18n";
import { getMonthGrid, monthOf, shiftMonth, type CalendarTodo } from "./calendar";
import "./TodoCalendar.css";

/** A month of days marked with their todos; a day's list opens beside it, and today or a later day takes new todos. */
export function TodoCalendar({
  today,
  dayTodos,
  onAddTodoForDay,
  onDeleteScheduled,
}: {
  today: string;
  dayTodos: Map<string, CalendarTodo[]>;
  onAddTodoForDay: (title: string, date: string) => void;
  onDeleteScheduled: (id: string) => void;
}) {
  const t = useTranslation();
  const [month, setMonth] = useState(() => monthOf(today));
  const [selected, setSelected] = useState(today);
  const [draft, setDraft] = useState("");
  const weekStart = t.localeTag.startsWith("zh") ? 1 : 0;
  const grid = useMemo(() => getMonthGrid(month, weekStart), [month, weekStart]);
  const formats = useMemo(() => ({
    month: new Intl.DateTimeFormat(t.localeTag, { year: "numeric", month: "long" }),
    weekday: new Intl.DateTimeFormat(t.localeTag, { weekday: "narrow" }),
    day: new Intl.DateTimeFormat(t.localeTag, { month: "long", day: "numeric", weekday: "short" }),
  }), [t.localeTag]);
  const toDate = (date: string) => new Date(`${date}T00:00:00`);
  const selectedTodos = dayTodos.get(selected) ?? [];
  const selectedLabel = formats.day.format(toDate(selected));
  const canAdd = selected >= today;

  const select = (date: string) => {
    setSelected(date);
    setDraft("");
    if (monthOf(date) !== month) setMonth(monthOf(date));
  };
  const add = () => {
    if (!draft.trim()) return;
    onAddTodoForDay(draft, selected);
    setDraft("");
  };

  return (
    <div className="todo-calendar">
      <div className="todo-calendar__month">
        <div className="todo-calendar__nav">
          <button type="button" aria-label={t.notebook.previousMonth} onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft size={14} strokeWidth={2.2} />
          </button>
          <span className="todo-calendar__title" aria-live="polite">{formats.month.format(toDate(`${month}-01`))}</span>
          <button type="button" aria-label={t.notebook.nextMonth} onClick={() => setMonth(shiftMonth(month, 1))}>
            <ChevronRight size={14} strokeWidth={2.2} />
          </button>
          {(month !== monthOf(today) || selected !== today) && (
            <button className="todo-calendar__today" type="button" aria-label={t.notebook.thisMonth} onClick={() => select(today)}>
              {t.notebook.dateToday}
            </button>
          )}
        </div>
        <div className="todo-calendar__grid">
          {grid.slice(0, 7).map((date) => (
            <span key={`w${date}`} className="todo-calendar__weekday" aria-hidden="true">{formats.weekday.format(toDate(date))}</span>
          ))}
          {grid.map((date) => {
            const items = dayTodos.get(date) ?? [];
            const marker = items.length === 0 ? "" : items.some((item) => item.scheduled) ? "scheduled"
              : items.every((item) => item.completed) ? "done" : "open";
            const className = [
              "todo-calendar__day",
              monthOf(date) !== month ? "todo-calendar__day--outside" : "",
              date === today ? "todo-calendar__day--today" : "",
              date === selected ? "todo-calendar__day--selected" : "",
            ].filter(Boolean).join(" ");
            return (
              <button
                key={date}
                className={className}
                type="button"
                aria-pressed={date === selected}
                aria-current={date === today ? "date" : undefined}
                aria-label={t.notebook.dayTodos(formats.day.format(toDate(date)), items.length)}
                data-date={date}
                onClick={() => select(date)}
              >
                {Number(date.slice(8))}
                {marker && <span className={`todo-calendar__dot todo-calendar__dot--${marker}`} />}
              </button>
            );
          })}
        </div>
      </div>
      <div className="todo-calendar__day-panel" role="region" aria-label={selectedLabel}>
        <div className="todo-calendar__day-title">{selectedLabel}</div>
        <div className="todo-calendar__list" role="list">
          {selectedTodos.length === 0 && <div className="todo-calendar__empty">{t.notebook.noTodosOnDay}</div>}
          {selectedTodos.map((todo) => (
            <div
              key={todo.id}
              role="listitem"
              className={`todo-calendar__item${todo.completed ? " todo-calendar__item--done" : ""}${todo.scheduled ? " todo-calendar__item--scheduled" : ""}`}
            >
              <span>{todo.title}</span>
              {todo.scheduled && (
                <button type="button" aria-label={t.notebook.deleteScheduled(todo.title)} onClick={() => onDeleteScheduled(todo.id)}>
                  <Trash2 size={12} strokeWidth={2.2} />
                </button>
              )}
            </div>
          ))}
        </div>
        {canAdd && (
          <input
            className="todo-calendar__input"
            value={draft}
            placeholder={t.notebook.addTaskFor(selectedLabel)}
            aria-label={t.notebook.addTaskFor(selectedLabel)}
            spellCheck={false}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                add();
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
