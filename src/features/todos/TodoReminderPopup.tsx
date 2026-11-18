import { BellRing } from "lucide-react";
import { useTranslation } from "../../i18n";
import "./TodoReminderPopup.css";

/** What the collapsed island says when a todo round reaches its reminder before the end. */
export type TodoReminder = { todoId: string; endsAt: number; title: string; minutes: number; at: number };

/** The collapsed island's line for a todo reminder: "「title」还剩 5 分钟", like the usage alert line. */
export function TodoReminderPopup({ reminder }: { reminder: TodoReminder }) {
  const t = useTranslation();
  return (
    <span className="todo-reminder-popup" role="status">
      <BellRing className="todo-reminder-popup__icon" size={16} strokeWidth={2.2} aria-hidden="true" />
      <span className="todo-reminder-popup__text">{t.todo.endingSoon(reminder.title, reminder.minutes)}</span>
    </span>
  );
}
