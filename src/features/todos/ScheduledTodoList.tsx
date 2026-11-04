import { Trash2 } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { ScheduledTodo } from "./types";
import "./ScheduledTodoList.css";

/** Todos planned for later days, grouped by day, each removable. */
export function ScheduledTodoList({
  todos,
  onDelete,
}: {
  todos: ScheduledTodo[];
  onDelete: (id: string) => void;
}) {
  const t = useTranslation();

  if (todos.length === 0) {
    return <div className="todo-empty">{t.notebook.noScheduled}</div>;
  }

  const format = new Intl.DateTimeFormat(t.localeTag, { month: "long", day: "numeric", weekday: "short" });
  const groups = new Map<string, ScheduledTodo[]>();
  for (const todo of todos) {
    groups.set(todo.date, [...(groups.get(todo.date) ?? []), todo]);
  }

  return (
    <div className="todo-list scheduled-list" role="list">
      {[...groups].map(([date, items]) => {
        const label = format.format(new Date(`${date}T00:00:00`));
        return (
          <div key={date} className="scheduled-list__group" role="group" aria-label={label}>
            <div className="scheduled-list__date">{label}</div>
            {items.map((todo) => (
              <div key={todo.id} className="scheduled-list__item" role="listitem">
                <span>{todo.title}</span>
                <button
                  type="button"
                  title={t.notebook.deleteScheduled(todo.title)}
                  aria-label={t.notebook.deleteScheduled(todo.title)}
                  onClick={() => onDelete(todo.id)}
                >
                  <Trash2 size={13} strokeWidth={2.2} />
                </button>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
