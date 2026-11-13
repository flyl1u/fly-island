import { useMemo } from "react";
import { useTranslation } from "../../i18n";
import { collectCalendarTodos } from "./calendar";
import { TodoCalendar } from "./TodoCalendar";
import { ScheduledTodoList } from "./ScheduledTodoList";
import { TodoNotebookTasks } from "./TodoNotebookTasks";
import { TodoNotebookTopline } from "./TodoNotebookTopline";
import type { ScheduledTodo, TodoArchive, TodoItem, TodoPageMode } from "./types";
import { withoutUpdateTodo } from "./updateTodo";
import "./TodoNotebook.css";

export function TodoNotebook({
  todos,
  dailyNote,
  draft,
  activeTodoId,
  currentDate,
  pageMode,
  archives,
  enableTodoReorder,
  scrollStartRows,
  draftDate,
  scheduledTodos,
  onDraftChange,
  onDraftDateChange,
  onAddTodo,
  onShowUpcoming,
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
}: {
  todos: TodoItem[];
  dailyNote: string;
  draft: string;
  activeTodoId: string | null;
  currentDate: string;
  pageMode: TodoPageMode;
  archives: TodoArchive[];
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
}) {
  const t = useTranslation();
  const calendarTodos = useMemo(
    () => pageMode === "calendar" ? collectCalendarTodos({ archives, todos, currentDate, scheduledTodos }) : null,
    [archives, currentDate, pageMode, scheduledTodos, todos],
  );
  const tasks = withoutUpdateTodo(todos);
  const completed = tasks.filter((todo) => todo.completed).length;

  return (
    <section className={`todo-notebook todo-notebook--${pageMode}`} aria-label={t.notebook.sectionLabel}>
      <TodoNotebookTopline
        pageMode={pageMode}
        scheduledCount={scheduledTodos.length}
        completed={completed}
        total={tasks.length}
        onSelectView={(view) => ({ today: onShowToday, daily: onShowDaily, calendar: onShowCalendar })[view]()}
        onShowToday={onShowToday}
        onShowUpcoming={onShowUpcoming}
      />

      {pageMode === "today" && (
        <TodoNotebookTasks
          displayedTodos={todos}
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

      {pageMode === "daily" ? (
        <textarea
          className="daily-note"
          value={dailyNote}
          placeholder={t.notebook.dailyPlaceholder}
          aria-label={t.notebook.dailyNoteLabel}
          spellCheck={false}
          onChange={(event) => onDailyNoteChange(event.currentTarget.value)}
        />
      ) : pageMode === "upcoming" ? (
        <ScheduledTodoList todos={scheduledTodos} onDelete={onDeleteScheduledTodo} />
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
