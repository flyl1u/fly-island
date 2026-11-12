import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "../../i18n";
import { dayDots, getMonthGrid, monthOf, shiftMonth, type CalendarTodo } from "./calendar";
import { dayHeading } from "./history";
import { TodoDayRow } from "./TodoDayRow";
import "./TodoCalendar.css";

/** A month of days marked with their todos; the chosen day's list sits below, and today or a later day takes new todos. */
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
  const grid = useMemo(() => getMonthGrid(month), [month]);
  const formats = useMemo(() => ({
    month: new Intl.DateTimeFormat(t.localeTag, { year: "numeric", month: "long" }),
    weekday: new Intl.DateTimeFormat(t.localeTag, { weekday: "narrow" }),
  }), [t.localeTag]);
  const toDate = (date: string) => new Date(`${date}T00:00:00`);
  const selectedTodos = dayTodos.get(selected) ?? [];
  const selectedLabel = dayHeading(selected, today, t.notebook);
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
      <div className="todo-calendar__nav">
        <button type="button" aria-label={t.notebook.previousMonth} onClick={() => setMonth(shiftMonth(month, -1))}>
          <ChevronLeft size={15} strokeWidth={2.2} />
        </button>
        <span className="todo-calendar__title" aria-live="polite">{formats.month.format(toDate(`${month}-01`))}</span>
        <button type="button" aria-label={t.notebook.nextMonth} onClick={() => setMonth(shiftMonth(month, 1))}>
          <ChevronRight size={15} strokeWidth={2.2} />
        </button>
        <button
          className="todo-calendar__today"
          type="button"
          aria-label={t.notebook.thisMonth}
          disabled={month === monthOf(today) && selected === today}
          onClick={() => select(today)}
        >
          {t.notebook.dateToday}
        </button>
      </div>
      <div className="todo-calendar__grid">
        {grid.slice(0, 7).map((date) => (
          <span key={`w${date}`} className="todo-calendar__weekday" aria-hidden="true">{formats.weekday.format(toDate(date))}</span>
        ))}
        {grid.map((date) => {
          const items = dayTodos.get(date) ?? [];
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
              aria-label={t.notebook.dayTodos(dayHeading(date, today, t.notebook), items.length)}
              data-date={date}
              onClick={() => select(date)}
            >
              <span className="todo-calendar__number">{Number(date.slice(8))}</span>
              <span className="todo-calendar__dots" aria-hidden="true">
                {dayDots(items).map((dot, index) => <span key={index} className={`todo-calendar__dot todo-calendar__dot--${dot}`} />)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="todo-calendar__day-head">
        <span className="todo-calendar__day-title">{selectedLabel}</span>
        {canAdd && (
          <label className="todo-calendar__add">
            <Plus size={13} strokeWidth={2.4} aria-hidden="true" />
            <input
              value={draft}
              placeholder={t.notebook.addTodo}
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
          </label>
        )}
      </div>
      <div className="todo-calendar__list" role="list" aria-label={selectedLabel}>
        {selectedTodos.length === 0 && <div className="todo-calendar__empty">{t.notebook.noTodosOnDay}</div>}
        {selectedTodos.map((todo) => (
          <TodoDayRow
            key={todo.id}
            title={todo.title}
            completed={todo.completed}
            scheduled={todo.scheduled}
            action={todo.scheduled && (
              <button
                className="todo-day-row__button todo-day-row__button--danger"
                type="button"
                aria-label={t.notebook.deleteScheduled(todo.title)}
                onClick={() => onDeleteScheduled(todo.id)}
              >
                <Trash2 size={12} strokeWidth={2.2} />
              </button>
            )}
          />
        ))}
      </div>
    </div>
  );
}
