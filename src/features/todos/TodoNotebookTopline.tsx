import { CalendarClock } from "lucide-react";
import { useTranslation } from "../../i18n";
import { TodoViewSwitch, type TodoView } from "./TodoViewSwitch";
import type { TodoPageMode } from "./types";

/** The view switch on the left; on the right only the controls of the open view. */
export function TodoNotebookTopline({
  pageMode,
  scheduledCount,
  completed,
  total,
  onSelectView,
  onShowToday,
  onShowUpcoming,
}: {
  pageMode: TodoPageMode;
  scheduledCount: number;
  completed: number;
  total: number;
  onSelectView: (view: TodoView) => void;
  onShowToday: () => void;
  onShowUpcoming: () => void;
}) {
  const t = useTranslation();
  const isUpcomingMode = pageMode === "upcoming";

  return (
    <div className="todo-notebook__topline">
      <div className="todo-notebook__title-group">
        <TodoViewSwitch pageMode={pageMode} onSelect={onSelectView} />
      </div>
      {(pageMode === "today" || isUpcomingMode) && (
        <div className="todo-notebook__title-group">
          {(isUpcomingMode || scheduledCount > 0) && (
            <button
              className={`todo-page-toggle todo-page-toggle--count${isUpcomingMode ? " todo-page-toggle--active" : ""}`}
              type="button"
              aria-label={isUpcomingMode ? t.notebook.backToTasks : t.notebook.showUpcoming(scheduledCount)}
              onClick={isUpcomingMode ? onShowToday : onShowUpcoming}
            >
              <CalendarClock size={14} strokeWidth={2.2} />
              <span className="todo-page-toggle__count">{scheduledCount}</span>
            </button>
          )}
          {isUpcomingMode ? (
            <span className="todo-notebook__count">{t.notebook.scheduledCount(scheduledCount)}</span>
          ) : (
            <div className="todo-notebook__progress">
              <progress
                aria-label={t.notebook.progress}
                aria-valuetext={t.notebook.doneOf(completed, total)}
                value={completed}
                max={Math.max(1, total)}
              />
              <span aria-hidden="true">{completed}/{total}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
