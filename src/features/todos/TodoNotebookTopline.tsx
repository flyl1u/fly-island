import { CalendarClock, ClipboardList, Columns2, NotebookPen } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { ArchiveLayout, TodoArchive } from "./types";

export function TodoNotebookTopline({
  isDailyMode,
  isTodayMode,
  isArchiveMode,
  isReviewMode,
  isUpcomingMode,
  selectedArchive,
  scheduledCount,
  archiveLayout,
  openCount,
  onShowToday,
  onShowUpcoming,
  onShowDaily,
  onArchiveLayoutChange,
}: {
  isDailyMode: boolean;
  isTodayMode: boolean;
  isArchiveMode: boolean;
  isReviewMode: boolean;
  isUpcomingMode: boolean;
  selectedArchive: TodoArchive | null;
  scheduledCount: number;
  archiveLayout: ArchiveLayout;
  openCount: number;
  onShowToday: () => void;
  onShowUpcoming: () => void;
  onShowDaily: () => void;
  onArchiveLayoutChange: (layout: ArchiveLayout) => void;
}) {
  const t = useTranslation();
  const archiveTitle =
    archiveLayout === "cards"
      ? t.notebook.notebookCards
      : t.notebook.twoColumnTimeline;

  return (
    <div className="todo-notebook__topline">
      <div className="todo-notebook__title-group">
        <span className="todo-notebook__tab">
          {isDailyMode ? (
            <NotebookPen size={15} strokeWidth={2.1} />
          ) : (
            <ClipboardList size={15} strokeWidth={2.1} />
          )}
          {isReviewMode
            ? selectedArchive?.date ?? t.notebook.reviewTab
            : isDailyMode
              ? t.notebook.dailyTab
              : isUpcomingMode ? t.notebook.upcomingTab : t.notebook.tasksTab}
        </span>
        {(isUpcomingMode || (isTodayMode && scheduledCount > 0)) && (
          <button
            className={`todo-page-toggle todo-page-toggle--count${isUpcomingMode ? " todo-page-toggle--active" : ""}`}
            type="button"
            title={isUpcomingMode ? t.notebook.backToTasks : t.notebook.showUpcoming(scheduledCount)}
            aria-label={isUpcomingMode ? t.notebook.backToTasks : t.notebook.showUpcoming(scheduledCount)}
            onClick={isUpcomingMode ? onShowToday : onShowUpcoming}
          >
            <CalendarClock size={14} strokeWidth={2.2} />
            <span className="todo-page-toggle__count">{scheduledCount}</span>
          </button>
        )}
        {(isTodayMode || isDailyMode) && (
          <button
            className={[
              "todo-page-toggle",
              isDailyMode ? "todo-page-toggle--active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            title={isDailyMode ? t.notebook.backToTasks : t.notebook.openDailyNote}
            aria-label={
              isDailyMode ? t.notebook.backToTasks : t.notebook.openDailyNote
            }
            onClick={isDailyMode ? onShowToday : onShowDaily}
          >
            {isDailyMode ? (
              <ClipboardList size={14} strokeWidth={2.2} />
            ) : (
              <NotebookPen size={14} strokeWidth={2.2} />
            )}
          </button>
        )}
      </div>
      {isArchiveMode ? (
        <div className="archive-layout-toggle" aria-label={archiveTitle}>
          <button
            className={archiveLayout === "cards" ? "archive-layout-toggle--active" : ""}
            type="button"
            title={t.notebook.notebookCards}
            aria-label={t.notebook.notebookCards}
            onClick={() => onArchiveLayoutChange("cards")}
          >
            <ClipboardList size={14} strokeWidth={2.1} />
          </button>
          <button
            className={archiveLayout === "timeline" ? "archive-layout-toggle--active" : ""}
            type="button"
            title={t.notebook.twoColumnTimeline}
            aria-label={t.notebook.twoColumnTimeline}
            onClick={() => onArchiveLayoutChange("timeline")}
          >
            <Columns2 size={14} strokeWidth={2.1} />
          </button>
        </div>
      ) : (
        <span className="todo-notebook__open-count">
          {isUpcomingMode ? t.notebook.scheduledCount(scheduledCount) : t.notebook.openCount(openCount)}
        </span>
      )}
    </div>
  );
}
