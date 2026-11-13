import { Plus } from "lucide-react";
import { useTranslation } from "../../i18n";
import { TodoDatePicker } from "./TodoDatePicker";
import { TodoListItem } from "./TodoListItem";
import type { TodoItem } from "./types";
import { useTodoNotebookEditing } from "./useTodoNotebookEditing";

export function TodoNotebookTasks({
  displayedTodos,
  draft,
  draftDate,
  currentDate,
  activeTodoId,
  enableTodoReorder,
  scrollStartRows,
  onDraftChange,
  onDraftDateChange,
  onAddTodo,
  onToggleTodo,
  onUpdateTodo,
  onStartTodo,
  onDeleteTodo,
  onReorderTodo,
}: {
  displayedTodos: TodoItem[];
  draft: string;
  draftDate: string | null;
  currentDate: string;
  activeTodoId: string | null;
  enableTodoReorder: boolean;
  scrollStartRows: number;
  onDraftChange: (value: string) => void;
  onDraftDateChange: (date: string | null) => void;
  onAddTodo: () => void;
  onToggleTodo: (id: string) => void;
  onUpdateTodo: (id: string, title: string) => void;
  onStartTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
  onReorderTodo: (sourceId: string, targetId: string) => void;
}) {
  const t = useTranslation();
  const canReorderTodos = enableTodoReorder;
  const listClassName = [
    "todo-list",
    displayedTodos.length > scrollStartRows ? "todo-list--scroll" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const inputPlaceholder = t.notebook.addTaskFor(draftDate && draftDate > currentDate ? draftDate : currentDate);
  const {
    editingTodoId,
    todoTitleDraft,
    setTodoTitleDraft,
    draggedTodoId,
    dragOverTodoId,
    startTodoTitleEdit,
    commitTodoTitleEdit,
    cancelTodoTitleEdit,
    startTodoDrag,
    moveTodoDrag,
    finishTodoDrag,
    cancelTodoDrag,
  } = useTodoNotebookEditing(
    true,
    canReorderTodos,
    onUpdateTodo,
    onReorderTodo,
  );

  return (
    <>
      <form
        className="todo-form todo-form--dated"
        onSubmit={(event) => {
          event.preventDefault();
          onAddTodo();
        }}
      >
        <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
        <input
          value={draft}
          placeholder={inputPlaceholder}
          aria-label={t.notebook.addTaskHint}
          onChange={(event) => onDraftChange(event.currentTarget.value)}
        />
        <TodoDatePicker value={draftDate} today={currentDate} disabled={false} onChange={onDraftDateChange} />
      </form>
      <div className={listClassName} role="list">
        {displayedTodos.length === 0 ? (
          <div className="todo-empty">
            {t.todo.empty}
          </div>
        ) : (
          displayedTodos.map((todo) => (
            <TodoListItem
              key={todo.id}
              todo={todo}
              isTodayMode
              isActive={todo.id === activeTodoId && !todo.completed}
              canReorder={canReorderTodos}
              isDragging={draggedTodoId === todo.id}
              isDragOver={dragOverTodoId === todo.id}
              isEditing={editingTodoId === todo.id}
              titleDraft={todoTitleDraft}
              onTitleDraftChange={setTodoTitleDraft}
              onCommitEdit={commitTodoTitleEdit}
              onCancelEdit={cancelTodoTitleEdit}
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
    </>
  );
}
