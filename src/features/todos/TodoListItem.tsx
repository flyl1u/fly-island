import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Check, GripVertical, Trash2 } from "lucide-react";
import { useTranslation } from "../../i18n";
import { getTodoTitleLineCount } from "../../utils/text";
import type { TodoItem } from "./types";
import { isUpdateTodo } from "./updateTodo";
import { UpdateTodoAction } from "./UpdateTodoAction";
import { TodoTitleEditor } from "./TodoTitleEditor";
import { TodoStartControl } from "./TodoStartControl";
import { TodoTimerActions } from "./TodoTimerActions";
import { todoMinutes, type TodoDuration, type TodoDurations, type TodoTimer } from "./timer";
import "./TodoListItem.css";

export function TodoListItem({
  todo,
  isTodayMode,
  isActive,
  timer = null,
  durations = {},
  onDurationChange = () => {},
  todoTimerEnabled = false,
  canReorder,
  isDragging,
  isEditing,
  titleDraft,
  onTitleDraftChange,
  onCommitEdit,
  onCancelEdit,
  onStartEdit,
  onToggle,
  onStart,
  onDelete,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: {
  todo: TodoItem;
  isTodayMode: boolean;
  isActive: boolean;
  timer?: TodoTimer | null;
  durations?: TodoDurations;
  onDurationChange?: (id: string, minutes: number) => void;
  todoTimerEnabled?: boolean;
  canReorder: boolean;
  isDragging: boolean;
  isEditing: boolean;
  titleDraft: string;
  onTitleDraftChange: (value: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: (todo: TodoItem) => void;
  onToggle: (id: string) => void;
  onStart: (id: string, duration?: TodoDuration) => void;
  onDelete: (id: string) => void;
  onDragStart: (event: ReactPointerEvent<HTMLButtonElement>, todoId: string) => void;
  onDragMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onDragEnd: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onDragCancel: () => void;
}) {
  const t = useTranslation();
  const titleLineCount = getTodoTitleLineCount(todo.title);
  const startButton = useRef<HTMLButtonElement>(null);
  const activeTimer = todoTimerEnabled && isActive ? timer : null;

  return (
    <div
      className={[
        "todo-item",
        todo.completed ? "todo-item--done" : "",
        isActive ? "todo-item--active" : "",
        canReorder ? "todo-item--reorderable" : "",
        isDragging ? "todo-item--dragging" : "",
        !isTodayMode ? "todo-item--readonly" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="listitem"
      data-todo-id={todo.id}
      style={
        {
          "--todo-title-min-height": `${titleLineCount * 19}px`,
        } as CSSProperties
      }
    >
      <button
        className="todo-check"
        type="button"
        aria-pressed={todo.completed}
        disabled={!isTodayMode}
        aria-label={t.todo.actionOnTask(
          todo.completed ? t.todo.markIncomplete : t.todo.complete,
          todo.title,
        )}
        onClick={() => onToggle(todo.id)}
      >
        {todo.completed && <Check size={14} strokeWidth={2.5} />}
      </button>
      {isTodayMode && isEditing ? (
        <TodoTitleEditor
          value={titleDraft}
          label={t.todo.editTitle}
          onChange={onTitleDraftChange}
          onCommit={onCommitEdit}
          onCancel={onCancelEdit}
        />
      ) : isTodayMode ? (
        <button
          className="todo-title todo-title--editable"
          type="button"
          onClick={() => onStartEdit(todo)}
        >
          {todo.title}
        </button>
      ) : (
        <span className="todo-title">{todo.title}</span>
      )}
      {isTodayMode && (
        <>
          {isUpdateTodo(todo) ? <UpdateTodoAction /> : <TodoStartControl
            todo={todo}
            isActive={isActive}
            activeTimer={activeTimer}
            timerEnabled={todoTimerEnabled}
            minutes={todoMinutes(durations, todo.id)}
            startRef={startButton}
            onStart={onStart}
            onDurationChange={(minutes) => onDurationChange(todo.id, minutes)}
          />}
          <button
            className="todo-delete"
            type="button"
            aria-label={t.todo.deleteTask(todo.title)}
            onClick={() => onDelete(todo.id)}
          >
            <Trash2 size={14} strokeWidth={2.2} />
          </button>
          {canReorder && (
            <button
              className="todo-drag-handle"
              type="button"
              aria-label={t.todo.reorderTask(todo.title)}
              disabled={isEditing}
              onPointerDown={(event) => onDragStart(event, todo.id)}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
              onPointerCancel={onDragCancel}
            >
              <GripVertical size={15} strokeWidth={2.4} />
            </button>
          )}
          {activeTimer?.notified && (
            <TodoTimerActions onComplete={() => onToggle(todo.id)}
              onRepeat={() => onStart(todo.id, activeTimer.durationMinutes)} />
          )}
        </>
      )}
    </div>
  );
}
