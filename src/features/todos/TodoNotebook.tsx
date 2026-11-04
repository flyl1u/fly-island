import { useTranslation } from "../../i18n";
import { ArchiveBrowser } from "./ArchiveBrowser";
import { ScheduledTodoList } from "./ScheduledTodoList";
import { TodoNotebookSpine } from "./TodoNotebookSpine";
import { TodoNotebookTasks } from "./TodoNotebookTasks";
import { TodoNotebookTopline } from "./TodoNotebookTopline";
import type { ArchiveLayout, SaveState, ScheduledTodo, TodoArchive, TodoItem, TodoPageMode } from "./types";
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
  saveState,
  enableTodoReorder,
  scrollStartRows,
  draftDate,
  scheduledTodos,
  onDraftChange,
  onDraftDateChange,
  onAddTodo,
  onShowUpcoming,
  onDeleteScheduledTodo,
  onToggleTodo,
  onUpdateTodo,
  onStartTodo,
  onDeleteTodo,
  onReorderTodo,
  onSaveToday,
  onShowArchive,
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
  saveState: SaveState;
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
  onDeleteScheduledTodo: (id: string) => void;
  onToggleTodo: (id: string) => void;
  onUpdateTodo: (id: string, title: string) => void;
  onStartTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
  onReorderTodo: (sourceId: string, targetId: string) => void;
  onSaveToday: () => void;
  onShowArchive: () => void;
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
  const openCount = displayedTodos.filter((todo) => !todo.completed).length;
  const showTasks = !isDailyMode && !isArchiveMode && !isUpcomingMode;
  const notebookClassName = [
    "todo-notebook",
    isDailyMode ? "todo-notebook--daily" : "",
    isArchiveMode ? "todo-notebook--archive" : "",
    isReviewMode ? "todo-notebook--review" : "",
    isUpcomingMode ? "todo-notebook--upcoming" : "",
    isArchiveMode ? `todo-notebook--archive-${archiveLayout}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={notebookClassName} aria-label={t.notebook.sectionLabel}>
      <TodoNotebookSpine
        pageMode={pageMode}
        saveState={saveState}
        onShowToday={onShowToday}
        onSaveToday={onSaveToday}
        onShowArchive={onShowArchive}
      />

      <TodoNotebookTopline
        isDailyMode={isDailyMode}
        isTodayMode={isTodayMode}
        isArchiveMode={isArchiveMode}
        isReviewMode={isReviewMode}
        isUpcomingMode={isUpcomingMode}
        selectedArchive={selectedArchive}
        scheduledCount={scheduledTodos.length}
        archiveLayout={archiveLayout}
        openCount={openCount}
        onShowToday={onShowToday}
        onShowUpcoming={onShowUpcoming}
        onShowDaily={onShowDaily}
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
      ) : null}
    </section>
  );
}
