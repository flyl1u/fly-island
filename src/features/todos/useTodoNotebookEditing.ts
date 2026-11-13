import { useCallback, useState } from "react";
import type { TodoItem } from "./types";

export function useTodoNotebookEditing(
  isTodayMode: boolean,
  onUpdateTodo: (id: string, title: string) => void,
) {
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [todoTitleDraft, setTodoTitleDraft] = useState("");

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

  const cancelTodoTitleEdit = useCallback(() => {
    setEditingTodoId(null);
    setTodoTitleDraft("");
  }, []);

  return {
    editingTodoId, todoTitleDraft, setTodoTitleDraft,
    startTodoTitleEdit, commitTodoTitleEdit, cancelTodoTitleEdit,
  };
}
