import { useMemo } from "react";
import { useTranslation } from "../../i18n";
import { ArchiveBrowser } from "./ArchiveBrowser";
import { collectCalendarTodos } from "./calendar";
import { groupTodoHistory } from "./history";
import { TodoCalendar } from "./TodoCalendar";
import { TodoHistoryList } from "./TodoHistoryList";
import { ScheduledTodoList } from "./ScheduledTodoList";
import { TodoNotebookTasks } from "./TodoNotebookTasks";
import { TodoNotebookTopline } from "./TodoNotebookTopline";
import type { ArchiveLayout, ScheduledTodo, TodoArchive, TodoItem, TodoPageMode } from "./types";
import "./TodoNotebook.css";

export function TodoNotebook({
  todos,
  dailyNote,
  draft,
  activeTodoId,
  currentDate,
  pageMode,
  archives,
  archiveLayout,
  selectedArchive,
  enableTodoReorder,
  scrollStartRows,
  draftDate,
  scheduledTodos,
  onDraftChange,
  onDraftDateChange,
  onAddTodo,
  onShowUpcoming,
  onShowHistory,
  onShowCalendar,
  onAddTodoForDay,
  onDeleteScheduledTodo,
  onToggleTodo,
  onUpdateTodo,
  onStartTodo,
  onDeleteTodo,
  onReorderTodo,
  onShowDaily,
  onShowToday,
  onDailyNoteChange,
  onArchiveLayoutChange,
  onSelectArchive,
}: {
  todos: TodoItem[];
  dailyNote: string;
  draft: string;
  activeTodoId: string | null;
  currentDate: string;
  pageMode: TodoPageMode;
  archives: TodoArchive[];
  archiveLayout: ArchiveLayout;
  selectedArchive: TodoArchive | null;
  enableTodoReorder: boolean;
  /** Rows shown before the list scrolls; the island grows to fit this many. */
  scrollStartRows: number;
  /** Day the next todo is for, or null for the list's own day. */
  draftDate: string | null;
  scheduledTodos: ScheduledTodo[];
  onDraftChange: (value: string) => void;
  onDraftDateChange: (date: string | null) => void;
  onAddTodo: () => void;
  onShowUpcoming: () => void;
  onShowHistory: () => void;
  onShowCalendar: () => void;
  /** Adds to today's list, or schedules for a later day. */
  onAddTodoForDay: (title: string, date: string) => void;
  onDeleteScheduledTodo: (id: string) => void;
  onToggleTodo: (id: string) => void;
  onUpdateTodo: (id: string, title: string) => void;
  onStartTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
  onReorderTodo: (sourceId: string, targetId: string) => void;
  onShowDaily: () => void;
  onShowToday: () => void;
  onDailyNoteChange: (value: string) => void;
  onArchiveLayoutChange: (layout: ArchiveLayout) => void;
  onSelectArchive: (date: string) => void;
}) {
  const t = useTranslation();
  const displayedTodos =
    pageMode === "review" ? selectedArchive?.todos ?? [] : todos;
  const isTodayMode = pageMode === "today";
  const isDailyMode = pageMode === "daily";
  const isArchiveMode = pageMode === "archive";
  const isReviewMode = pageMode === "review";
  const isUpcomingMode = pageMode === "upcoming";
  const isHistoryMode = pageMode === "history";
  const isCalendarMode = pageMode === "calendar";
  const historyDays = useMemo(() => groupTodoHistory(archives, currentDate, todos), [archives, currentDate, todos]);
  const calendarTodos = useMemo(
    () => (isCalendarMode ? collectCalendarTodos({ archives, todos, currentDate, scheduledTodos }) : null),
    [archives, currentDate, isCalendarMode, scheduledTodos, todos],
  );
  const openCount = displayedTodos.filter((todo) => !todo.completed).length;
  const showTasks = !isDailyMode && !isArchiveMode && !isUpcomingMode && !isHistoryMode && !isCalendarMode;
  const notebookClassName = [
    "todo-notebook",
    isDailyMode ? "todo-notebook--daily" : "",
    isArchiveMode ? "todo-notebook--archive" : "",
    isReviewMode ? "todo-notebook--review" : "",
    isUpcomingMode ? "todo-notebook--upcoming" : "",
    isHistoryMode ? "todo-notebook--history" : "",
    isCalendarMode ? "todo-notebook--calendar" : "",
    isArchiveMode ? `todo-notebook--archive-${archiveLayout}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={notebookClassName} aria-label={t.notebook.sectionLabel}>
      <TodoNotebookTopline
        pageMode={pageMode}
        selectedArchive={selectedArchive}
        scheduledCount={scheduledTodos.length}
        archiveLayout={archiveLayout}
        openCount={openCount}
        onSelectView={(view) => ({ today: onShowToday, daily: onShowDaily, history: onShowHistory, calendar: onShowCalendar })[view]()}
        onShowToday={onShowToday}
        onShowUpcoming={onShowUpcoming}
        onArchiveLayoutChange={onArchiveLayoutChange}
      />

      {showTasks && (
        <TodoNotebookTasks
          displayedTodos={displayedTodos}
          isTodayMode={isTodayMode}
          isReviewMode={isReviewMode}
          draft={draft}
          draftDate={draftDate}
          currentDate={currentDate}
          activeTodoId={activeTodoId}
          enableTodoReorder={enableTodoReorder}
          scrollStartRows={scrollStartRows}
          onDraftChange={onDraftChange}
          onDraftDateChange={onDraftDateChange}
          onAddTodo={onAddTodo}
          onToggleTodo={onToggleTodo}
          onUpdateTodo={onUpdateTodo}
          onStartTodo={onStartTodo}
          onDeleteTodo={onDeleteTodo}
          onReorderTodo={onReorderTodo}
        />
      )}

      {isArchiveMode ? (
        <ArchiveBrowser
          archives={archives}
          layout={archiveLayout}
          onSelectArchive={onSelectArchive}
        />
      ) : isDailyMode ? (
        <textarea
          className="daily-note"
          value={dailyNote}
          placeholder={t.notebook.dailyPlaceholder}
          aria-label={t.notebook.dailyNoteLabel}
          spellCheck={false}
          onChange={(event) => onDailyNoteChange(event.currentTarget.value)}
        />
      ) : isUpcomingMode ? (
        <ScheduledTodoList todos={scheduledTodos} onDelete={onDeleteScheduledTodo} />
      ) : isHistoryMode ? (
        <TodoHistoryList days={historyDays} today={currentDate} todayTodos={todos} onRestore={(title) => onAddTodoForDay(title, currentDate)} />
      ) : calendarTodos ? (
        <TodoCalendar
          today={currentDate}
          dayTodos={calendarTodos}
          onAddTodoForDay={onAddTodoForDay}
          onDeleteScheduled={onDeleteScheduledTodo}
        />
      ) : null}
    </section>
  );
}
