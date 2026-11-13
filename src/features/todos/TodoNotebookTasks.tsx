import { useTodoDrag } from "./useTodoDrag";
import { useTodoReorderMotion } from "./useTodoReorderMotion";
import { Plus } from "lucide-react";
import { useTranslation } from "../../i18n";
import { TodoDatePicker } from "./TodoDatePicker";
import { TodoListItem } from "./TodoListItem";
import type { TodoItem } from "./types";
import type { TodoDuration, TodoDurations, TodoTimer } from "./timer";
import { useTodoNotebookEditing } from "./useTodoNotebookEditing";
import { useTodoListHeight } from "./useTodoListHeight";

export function TodoNotebookTasks({
  displayedTodos,
  draft,
  draftDate,
  currentDate,
  activeTodoId,
  timer,
  durations,
  onDurationChange,
  todoTimerEnabled = false,
  onListHeightChange,
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
  timer?: TodoTimer | null;
  durations?: TodoDurations;
  onDurationChange?: (id: string, minutes: number) => void;
  todoTimerEnabled?: boolean;
  onListHeightChange?: (height: number) => void;
  enableTodoReorder: boolean;
  scrollStartRows: number;
  onDraftChange: (value: string) => void;
  onDraftDateChange: (date: string | null) => void;
  onAddTodo: () => void;
  onToggleTodo: (id: string) => void;
  onUpdateTodo: (id: string, title: string) => void;
  onStartTodo: (id: string, duration?: TodoDuration) => void;
  onDeleteTodo: (id: string) => void;
  onReorderTodo: (sourceId: string, index: number) => void;
}) {
  const t = useTranslation();
  const listRef = useTodoListHeight(displayedTodos, onListHeightChange);
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
    startTodoTitleEdit, commitTodoTitleEdit, cancelTodoTitleEdit,
  } = useTodoNotebookEditing(true, onUpdateTodo);
  const {
    previewOrder, draggedTodoId, startTodoDrag, moveTodoDrag,
    finishTodoDrag, cancelTodoDrag,
  } = useTodoDrag(listRef, displayedTodos, canReorderTodos, editingTodoId, onReorderTodo);
  const orderedTodos = previewOrder
    ? previewOrder.flatMap((id) => displayedTodos.filter((todo) => todo.id === id))
    : displayedTodos;
  useTodoReorderMotion(listRef, orderedTodos, draggedTodoId);


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
      <div ref={listRef} className={listClassName} role="list">
        {displayedTodos.length === 0 ? (
          <div className="todo-empty">
            {t.todo.empty}
          </div>
        ) : (
          orderedTodos.map((todo) => (
            <TodoListItem
              key={todo.id}
              todo={todo}
              isTodayMode
              isActive={todo.id === activeTodoId && !todo.completed}
              timer={timer?.todoId === todo.id ? timer : null}
              durations={durations}
              onDurationChange={onDurationChange}
              todoTimerEnabled={todoTimerEnabled}
              canReorder={canReorderTodos}
              isDragging={draggedTodoId === todo.id}
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
