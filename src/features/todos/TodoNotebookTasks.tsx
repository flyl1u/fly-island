import { Plus } from "lucide-react";
import { useTranslation } from "../../i18n";
import { TodoDatePicker } from "./TodoDatePicker";
import { TodoListItem } from "./TodoListItem";
import type { TodoItem } from "./types";
import { useTodoNotebookEditing } from "./useTodoNotebookEditing";

export function TodoNotebookTasks({
  displayedTodos,
  isTodayMode,
  isReviewMode,
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
  isTodayMode: boolean;
  isReviewMode: boolean;
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
  const canReorderTodos = isTodayMode && enableTodoReorder;
  const listClassName = [
    "todo-list",
    displayedTodos.length > scrollStartRows ? "todo-list--scroll" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const inputPlaceholder =
    isTodayMode
      ? t.notebook.addTaskFor(draftDate && draftDate > currentDate ? draftDate : currentDate)
      : t.notebook.reviewTodos;
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
    isTodayMode,
    canReorderTodos,
    onUpdateTodo,
    onReorderTodo,
  );

  return (
    <>
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
