import { useCallback, useState, type PointerEvent as ReactPointerEvent } from "react";
import { CalendarClock, ClipboardList, Columns2, NotebookPen, Plus } from "lucide-react";
import { useTranslation } from "../../i18n";
import { ArchiveBrowser } from "./ArchiveBrowser";
import { ScheduledTodoList } from "./ScheduledTodoList";
import { TodoDatePicker } from "./TodoDatePicker";
import { TodoListItem } from "./TodoListItem";
import { TodoNotebookSpine } from "./TodoNotebookSpine";
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
  const listClassName = [
    "todo-list",
    displayedTodos.length > scrollStartRows ? "todo-list--scroll" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const inputPlaceholder =
    pageMode === "today"
      ? t.notebook.addTaskFor(draftDate && draftDate > currentDate ? draftDate : currentDate)
      : t.notebook.reviewTodos;
  const archiveTitle =
    archiveLayout === "cards"
      ? t.notebook.notebookCards
      : t.notebook.twoColumnTimeline;
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
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [todoTitleDraft, setTodoTitleDraft] = useState("");
  const [draggedTodoId, setDraggedTodoId] = useState<string | null>(null);
  const [dragOverTodoId, setDragOverTodoId] = useState<string | null>(null);
  const canReorderTodos = isTodayMode && enableTodoReorder;

  const startTodoTitleEdit = useCallback((todo: TodoItem) => {
    if (!isTodayMode) {
      return;
    }

    setEditingTodoId(todo.id);
    setTodoTitleDraft(todo.title);
  }, [isTodayMode]);

  const commitTodoTitleEdit = useCallback(() => {
    if (!editingTodoId) {
      return;
    }

    const nextTitle = todoTitleDraft.trim();

    if (nextTitle) {
      onUpdateTodo(editingTodoId, nextTitle);
    }

    setEditingTodoId(null);
    setTodoTitleDraft("");
  }, [editingTodoId, onUpdateTodo, todoTitleDraft]);

  const getTodoIdAtPoint = useCallback((clientX: number, clientY: number) => {
    const element = document.elementFromPoint(clientX, clientY);
    const todoElement = element?.closest("[data-todo-id]");

    return todoElement instanceof HTMLElement
      ? todoElement.dataset.todoId ?? null
      : null;
  }, []);

  const startTodoDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, todoId: string) => {
      if (!canReorderTodos || editingTodoId === todoId) {
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDraggedTodoId(todoId);
      setDragOverTodoId(null);
    },
    [canReorderTodos, editingTodoId],
  );

  const moveTodoDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!draggedTodoId) {
        return;
      }

      event.preventDefault();
      const targetTodoId = getTodoIdAtPoint(event.clientX, event.clientY);
      setDragOverTodoId(
        targetTodoId && targetTodoId !== draggedTodoId ? targetTodoId : null,
      );
    },
    [draggedTodoId, getTodoIdAtPoint],
  );

  const finishTodoDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!draggedTodoId) {
        return;
      }

      event.preventDefault();
      const targetTodoId =
        dragOverTodoId || getTodoIdAtPoint(event.clientX, event.clientY);

      if (targetTodoId && targetTodoId !== draggedTodoId) {
        onReorderTodo(draggedTodoId, targetTodoId);
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      setDraggedTodoId(null);
      setDragOverTodoId(null);
    },
    [dragOverTodoId, draggedTodoId, getTodoIdAtPoint, onReorderTodo],
  );

  const cancelTodoDrag = useCallback(() => {
    setDraggedTodoId(null);
    setDragOverTodoId(null);
  }, []);

  return (
    <section className={notebookClassName} aria-label={t.notebook.sectionLabel}>
      <TodoNotebookSpine
        pageMode={pageMode}
        saveState={saveState}
        onShowToday={onShowToday}
        onSaveToday={onSaveToday}
        onShowArchive={onShowArchive}
      />

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
          {(isUpcomingMode || (isTodayMode && scheduledTodos.length > 0)) && (
            <button
              className={`todo-page-toggle todo-page-toggle--count${isUpcomingMode ? " todo-page-toggle--active" : ""}`}
              type="button"
              title={isUpcomingMode ? t.notebook.backToTasks : t.notebook.showUpcoming(scheduledTodos.length)}
              aria-label={isUpcomingMode ? t.notebook.backToTasks : t.notebook.showUpcoming(scheduledTodos.length)}
              onClick={isUpcomingMode ? onShowToday : onShowUpcoming}
            >
              <CalendarClock size={14} strokeWidth={2.2} />
              <span className="todo-page-toggle__count">{scheduledTodos.length}</span>
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
            {isUpcomingMode ? t.notebook.scheduledCount(scheduledTodos.length) : t.notebook.openCount(openCount)}
          </span>
        )}
      </div>

      {!isDailyMode && !isArchiveMode && !isUpcomingMode && (
        <form
          className={`todo-form${isTodayMode ? " todo-form--dated" : ""}`}
          onSubmit={(event) => {
            event.preventDefault();
            if (isTodayMode) {
              onAddTodo();
            }
          }}
        >
          <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
          <input
            value={draft}
            disabled={!isTodayMode}
            placeholder={inputPlaceholder}
            aria-label={t.notebook.addTaskHint}
            onChange={(event) => onDraftChange(event.currentTarget.value)}
          />
          {isTodayMode && (
            <TodoDatePicker value={draftDate} today={currentDate} disabled={false} onChange={onDraftDateChange} />
          )}
        </form>
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
      ) : (
        <div className={listClassName} role="list">
          {displayedTodos.length === 0 ? (
            <div className="todo-empty">
              {isReviewMode ? t.todo.emptyReview : t.todo.empty}
            </div>
          ) : (
            displayedTodos.map((todo) => (
              <TodoListItem
                key={todo.id}
                todo={todo}
                isTodayMode={isTodayMode}
                isActive={
                  isTodayMode && todo.id === activeTodoId && !todo.completed
                }
                canReorder={canReorderTodos}
                isDragging={draggedTodoId === todo.id}
                isDragOver={dragOverTodoId === todo.id}
                isEditing={editingTodoId === todo.id}
                titleDraft={todoTitleDraft}
                onTitleDraftChange={setTodoTitleDraft}
                onCommitEdit={commitTodoTitleEdit}
                onCancelEdit={() => {
                  setEditingTodoId(null);
                  setTodoTitleDraft("");
                }}
                onStartEdit={startTodoTitleEdit}
                onToggle={onToggleTodo}
                onStart={onStartTodo}
                onDelete={onDeleteTodo}
                onDragStart={startTodoDrag}
                onDragMove={moveTodoDrag}
                onDragEnd={finishTodoDrag}
                onDragCancel={cancelTodoDrag}
              />
            ))
          )}
        </div>
      )}
    </section>
  );
}
