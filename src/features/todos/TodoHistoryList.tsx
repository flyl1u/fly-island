import { Check, CornerUpLeft } from "lucide-react";
import { useTranslation } from "../../i18n";
import { hasOpenTodoTitled, type TodoHistoryDay } from "./history";
import type { TodoItem } from "./types";
import "./TodoHistoryList.css";

/** Earlier days' todos, newest day first; an unfinished one can be added to today. */
export function TodoHistoryList({
  days,
  todayTodos,
  onRestore,
}: {
  days: TodoHistoryDay[];
  todayTodos: TodoItem[];
  onRestore: (title: string) => void;
}) {
  const t = useTranslation();

  if (days.length === 0) {
    return <div className="todo-empty">{t.notebook.noHistory}</div>;
  }

  const format = new Intl.DateTimeFormat(t.localeTag, { year: "numeric", month: "long", day: "numeric", weekday: "short" });

  return (
    <div className="todo-list scheduled-list todo-history" role="list">
      {days.map((day) => {
        const label = format.format(new Date(`${day.date}T00:00:00`));
        return (
          <div key={day.date} className="scheduled-list__group" role="group" aria-label={label}>
            <div className="todo-history__date">
              <span>{label}</span>
              <span>{t.notebook.doneOf(day.doneCount, day.todos.length)}</span>
            </div>
            {day.todos.map((todo) => {
              const restored = !todo.completed && hasOpenTodoTitled(todayTodos, todo.title);
              return (
                <div
                  key={todo.id}
                  className={`scheduled-list__item todo-history__item${todo.completed ? " todo-history__item--done" : ""}`}
                  role="listitem"
                >
                  <span className="todo-history__mark" aria-hidden="true">
                    {todo.completed && <Check size={10} strokeWidth={3} />}
                  </span>
                  <span>{todo.title}</span>
                  {todo.completed ? (
                    <span />
                  ) : (
                    <button
                      type="button"
                      disabled={restored}
                      aria-label={restored ? t.notebook.alreadyToday : t.notebook.restoreTodo(todo.title)}
                      onClick={() => onRestore(todo.title)}
                    >
                      {restored ? <Check size={13} strokeWidth={2.2} /> : <CornerUpLeft size={13} strokeWidth={2.2} />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
