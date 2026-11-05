import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { Check, GripVertical, Play, Trash2 } from "lucide-react";
import { useTranslation } from "../../i18n";
import { getTodoTitleLineCount } from "../../utils/text";
import { isUpdateTodo } from "./updateTodo";
import { UpdateTodoAction } from "./UpdateTodoAction";
import type { TodoItem } from "./types";
import "./TodoListItem.css";

export function TodoListItem({
  todo,
  isTodayMode,
  isActive,
  canReorder,
  isDragging,
  isDragOver,
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
  canReorder: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  isEditing: boolean;
  titleDraft: string;
  onTitleDraftChange: (value: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: (todo: TodoItem) => void;
  onToggle: (id: string) => void;
  onStart: (id: string) => void;
  onDelete: (id: string) => void;
  onDragStart: (event: ReactPointerEvent<HTMLButtonElement>, todoId: string) => void;
  onDragMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onDragEnd: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onDragCancel: () => void;
}) {
  const t = useTranslation();
  const titleLineCount = getTodoTitleLineCount(todo.title);

  return (
    <div
      className={[
        "todo-item",
        todo.completed ? "todo-item--done" : "",
        isActive ? "todo-item--active" : "",
        canReorder ? "todo-item--reorderable" : "",
        isDragging ? "todo-item--dragging" : "",
        isDragOver ? "todo-item--drag-over" : "",
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
        title={todo.completed ? t.todo.markIncomplete : t.todo.complete}
        aria-label={t.todo.actionOnTask(
          todo.completed ? t.todo.markIncomplete : t.todo.complete,
          todo.title,
        )}
        onClick={() => onToggle(todo.id)}
      >
        {todo.completed && <Check size={14} strokeWidth={2.5} />}
      </button>
      {isTodayMode && isEditing ? (
        <input
          className="todo-title-input"
          value={titleDraft}
          aria-label={t.todo.editTitle}
          autoFocus
          onChange={(event) => onTitleDraftChange(event.currentTarget.value)}
          onBlur={onCommitEdit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onCommitEdit();
            }

            if (event.key === "Escape") {
              onCancelEdit();
            }
          }}
        />
      ) : isTodayMode ? (
        <button
          className="todo-title todo-title--editable"
          type="button"
          title={t.todo.editTitle}
          onClick={() => onStartEdit(todo)}
        >
          {todo.title}
        </button>
      ) : (
        <span className="todo-title">{todo.title}</span>
      )}
      {isTodayMode && (
        <>
          {isUpdateTodo(todo) ? <UpdateTodoAction /> : <button
            className={["todo-start", isActive ? "todo-start--active" : ""]
              .filter(Boolean)
              .join(" ")}
            type="button"
            title={isActive ? t.todo.stop : t.todo.start}
            aria-label={t.todo.actionOnTask(
              isActive ? t.todo.stop : t.todo.start,
              todo.title,
            )}
            disabled={todo.completed}
            onClick={() => onStart(todo.id)}
          >
            <Play size={13} strokeWidth={2.4} />
            <span>{isActive ? t.todo.stop : t.todo.start}</span>
          </button>}
          <button
            className="todo-delete"
            type="button"
            title={t.todo.delete}
            aria-label={t.todo.deleteTask(todo.title)}
            onClick={() => onDelete(todo.id)}
          >
            <Trash2 size={14} strokeWidth={2.2} />
          </button>
          {canReorder && (
            <button
              className="todo-drag-handle"
              type="button"
              title={t.todo.reorder}
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
        </>
      )}
    </div>
  );
}
