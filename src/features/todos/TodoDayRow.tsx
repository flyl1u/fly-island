import type { ReactNode } from "react";
import { Check } from "lucide-react";
import "./TodoDayRow.css";

/** One todo in the history or the calendar's day list: a done mark, the title and an action that shows on hover. */
export function TodoDayRow({
  title,
  completed,
  scheduled = false,
  action,
}: {
  title: string;
  completed: boolean;
  /** Planned for a later day; drawn in the scheduled colour. */
  scheduled?: boolean;
  action?: ReactNode;
}) {
  const className = ["todo-day-row", completed ? "todo-day-row--done" : "", scheduled ? "todo-day-row--scheduled" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={className} role="listitem">
      <span className="todo-day-row__mark" aria-hidden="true">
        {completed && <Check size={10} strokeWidth={3} />}
      </span>
      <span className="todo-day-row__title">{title}</span>
      {action && <span className="todo-day-row__action">{action}</span>}
    </div>
  );
}
