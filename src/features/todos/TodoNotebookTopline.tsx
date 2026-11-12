import { CalendarClock, CalendarDays, ClipboardList, Columns2, History, NotebookPen, type LucideIcon } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { ArchiveLayout, TodoArchive, TodoPageMode } from "./types";

/** Opens one of the todo pages; while that page is open it shows the list icon and goes back. */
function PageToggle({ active, icon: Icon, openLabel, backLabel, onOpen, onBack }: {
  active: boolean;
  icon: LucideIcon;
  openLabel: string;
  backLabel: string;
  onOpen: () => void;
  onBack: () => void;
}) {
  const Shown = active ? ClipboardList : Icon;
  return (
    <button
      className={`todo-page-toggle${active ? " todo-page-toggle--active" : ""}`}
      type="button"
      aria-label={active ? backLabel : openLabel}
      onClick={active ? onBack : onOpen}
    >
      <Shown size={14} strokeWidth={2.2} />
    </button>
  );
}

export function TodoNotebookTopline({
  isDailyMode,
  isTodayMode,
  isArchiveMode,
  isReviewMode,
  isUpcomingMode,
  pageMode,
  historyDayCount,
  selectedArchive,
  scheduledCount,
  archiveLayout,
  openCount,
  onShowToday,
  onShowUpcoming,
  onShowDaily,
  onShowHistory,
  onShowCalendar,
  onArchiveLayoutChange,
}: {
  isDailyMode: boolean;
  isTodayMode: boolean;
  isArchiveMode: boolean;
  isReviewMode: boolean;
  isUpcomingMode: boolean;
  pageMode: TodoPageMode;
  historyDayCount: number;
  selectedArchive: TodoArchive | null;
  scheduledCount: number;
  archiveLayout: ArchiveLayout;
  openCount: number;
  onShowToday: () => void;
  onShowUpcoming: () => void;
  onShowDaily: () => void;
  onShowHistory: () => void;
  onShowCalendar: () => void;
  onArchiveLayoutChange: (layout: ArchiveLayout) => void;
}) {
  const t = useTranslation();
  const isHistoryMode = pageMode === "history";
  const isCalendarMode = pageMode === "calendar";
  const TabIcon = isDailyMode ? NotebookPen : isHistoryMode ? History : isCalendarMode ? CalendarDays : ClipboardList;
  const archiveTitle =
    archiveLayout === "cards"
      ? t.notebook.notebookCards
      : t.notebook.twoColumnTimeline;

  return (
    <div className="todo-notebook__topline">
      <div className="todo-notebook__title-group">
        <span className="todo-notebook__tab">
          <TabIcon size={15} strokeWidth={2.1} />
          {isReviewMode
            ? selectedArchive?.date ?? t.notebook.reviewTab
            : isDailyMode
              ? t.notebook.dailyTab
              : isHistoryMode
                ? t.notebook.historyTab
                : isCalendarMode
                  ? t.notebook.calendarTab
                  : isUpcomingMode ? t.notebook.upcomingTab : t.notebook.tasksTab}
        </span>
        {(isUpcomingMode || (isTodayMode && scheduledCount > 0)) && (
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
        {(isTodayMode || isDailyMode || isHistoryMode || isCalendarMode) && (
          <>
            <PageToggle active={isDailyMode} icon={NotebookPen} openLabel={t.notebook.openDailyNote} backLabel={t.notebook.backToTasks} onOpen={onShowDaily} onBack={onShowToday} />
            <PageToggle active={isHistoryMode} icon={History} openLabel={t.notebook.openHistory} backLabel={t.notebook.backToTasks} onOpen={onShowHistory} onBack={onShowToday} />
            <PageToggle active={isCalendarMode} icon={CalendarDays} openLabel={t.notebook.openCalendar} backLabel={t.notebook.backToTasks} onOpen={onShowCalendar} onBack={onShowToday} />
          </>
        )}
      </div>
      {isArchiveMode ? (
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
      ) : isCalendarMode ? null : (
        <span className="todo-notebook__open-count">
          {isUpcomingMode
            ? t.notebook.scheduledCount(scheduledCount)
            : isHistoryMode
              ? t.notebook.historyDays(historyDayCount)
              : t.notebook.openCount(openCount)}
        </span>
      )}
    </div>
  );
}
