import { CalendarClock, ClipboardList, Columns2 } from "lucide-react";
import { useTranslation } from "../../i18n";
import { TodoViewSwitch, type TodoView } from "./TodoViewSwitch";
import type { ArchiveLayout, TodoArchive, TodoPageMode } from "./types";

/** The view switch on the left; on the right only the controls of the open view. */
export function TodoNotebookTopline({
  pageMode,
  selectedArchive,
  scheduledCount,
  archiveLayout,
  openCount,
  onSelectView,
  onShowToday,
  onShowUpcoming,
  onArchiveLayoutChange,
}: {
  pageMode: TodoPageMode;
  selectedArchive: TodoArchive | null;
  scheduledCount: number;
  archiveLayout: ArchiveLayout;
  openCount: number;
  onSelectView: (view: TodoView) => void;
  onShowToday: () => void;
  onShowUpcoming: () => void;
  onArchiveLayoutChange: (layout: ArchiveLayout) => void;
}) {
  const t = useTranslation();
  const isUpcomingMode = pageMode === "upcoming";
  const archiveTitle =
    archiveLayout === "cards"
      ? t.notebook.notebookCards
      : t.notebook.twoColumnTimeline;

  return (
    <div className="todo-notebook__topline">
      <div className="todo-notebook__title-group">
        <TodoViewSwitch pageMode={pageMode} onSelect={onSelectView} />
      </div>
      {pageMode === "archive" ? (
        <div className="archive-layout-toggle" aria-label={archiveTitle}>
          <button
            className={archiveLayout === "cards" ? "archive-layout-toggle--active" : ""}
            type="button"
            aria-label={t.notebook.notebookCards}
            onClick={() => onArchiveLayoutChange("cards")}
          >
            <ClipboardList size={14} strokeWidth={2.1} />
          </button>
          <button
            className={archiveLayout === "timeline" ? "archive-layout-toggle--active" : ""}
            type="button"
            aria-label={t.notebook.twoColumnTimeline}
            onClick={() => onArchiveLayoutChange("timeline")}
          >
            <Columns2 size={14} strokeWidth={2.1} />
          </button>
        </div>
      ) : pageMode === "review" ? (
        <span className="todo-notebook__open-count">{selectedArchive?.date ?? t.notebook.reviewTab}</span>
      ) : pageMode === "today" || isUpcomingMode ? (
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
          <span className="todo-notebook__open-count">
            {isUpcomingMode ? t.notebook.scheduledCount(scheduledCount) : t.notebook.openCount(openCount)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
