import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, CornerUpLeft, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "../../i18n";
import { dayDots, dayHeading, getMonthGrid, monthOf, shiftMonth, type CalendarTodo } from "./calendar";
import { TodoDayDetail } from "./TodoDayDetail";
import { TodoDayRow } from "./TodoDayRow";
import "./TodoCalendar.css";

/** A compact month beside the chosen day's list; today or a later day can take new todos. */
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
    month: new Intl.DateTimeFormat(t.localeTag, { year: "numeric", month: "short" }),
    weekday: new Intl.DateTimeFormat(t.localeTag, { weekday: "narrow" }),
  }), [t.localeTag]);
  const toDate = (date: string) => new Date(`${date}T00:00:00`);
  const selectedTodos = dayTodos.get(selected) ?? [];
  const selectedLabel = dayHeading(selected, today, t.notebook);
  const canAdd = selected >= today;
  const openToday = new Set(dayTodos.get(today)?.filter((todo) => !todo.completed).map((todo) => todo.title.trim()));

  const select = (date: string) => {
    setMonth(monthOf(date));
    if (date === selected) return;
    setSelected(date);
    setDraft("");
  };
  const add = () => {
    if (!draft.trim()) return;
    onAddTodoForDay(draft, selected);
    setDraft("");
  };

  return (
    <div className="todo-date-overview todo-calendar">
      <nav className="todo-date-overview__sidebar" aria-label={t.notebook.pickDate}>
        <div className="todo-calendar__nav">
          <button type="button" aria-label={t.notebook.previousMonth} onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft size={15} strokeWidth={2.2} aria-hidden="true" />
          </button>
          <span className="todo-calendar__title" aria-live="polite">{formats.month.format(toDate(`${month}-01`))}</span>
          <button type="button" aria-label={t.notebook.nextMonth} onClick={() => setMonth(shiftMonth(month, 1))}>
            <ChevronRight size={15} strokeWidth={2.2} aria-hidden="true" />
          </button>
          <button
            className="todo-calendar__today"
            type="button"
            aria-label={t.notebook.calendarGoToToday}
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
      </nav>
      <TodoDayDetail
        date={selected}
        today={today}
        summary={selectedTodos.length > 0 ? t.notebook.doneOf(
          selectedTodos.filter((todo) => todo.completed).length, selectedTodos.length,
        ) : undefined}
        composer={canAdd && (
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
      >
        {selectedTodos.map((todo) => {
          const moved = openToday.has(todo.title.trim());
          return (
            <TodoDayRow
              key={todo.id}
              title={todo.title}
              completed={todo.completed}
              scheduled={todo.scheduled}
              action={todo.scheduled ? (
                <button
                  className="todo-day-row__button todo-day-row__button--danger"
                  type="button"
                  aria-label={t.notebook.deleteScheduled(todo.title)}
                  onClick={() => onDeleteScheduled(todo.id)}
                >
                  <Trash2 size={12} strokeWidth={2.2} aria-hidden="true" />
                </button>
              ) : !canAdd && !todo.completed && (
                <button
                  className="todo-day-row__button"
                  type="button"
                  disabled={moved}
                  aria-label={moved ? t.notebook.alreadyToday : t.notebook.restoreTodo(todo.title)}
                  title={moved ? t.notebook.alreadyToday : t.notebook.moveToToday}
                  onClick={() => onAddTodoForDay(todo.title, today)}
                >
                  {moved ? <Check size={12} strokeWidth={2.4} aria-hidden="true" /> : <CornerUpLeft size={12} strokeWidth={2.4} aria-hidden="true" />}
                </button>
              )}
            />
          );
        })}
      </TodoDayDetail>
    </div>
  );
}
