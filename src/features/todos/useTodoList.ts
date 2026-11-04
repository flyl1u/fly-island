import { useCallback, useEffect, useState } from "react";
import { createTodoId, loadActiveTodoId, loadTodos, saveActiveTodoId, saveTodos } from "./storage";
import { dismissUpdatePrompt } from "../updater/updaterController";
import { UPDATE_TODO_ID, withoutUpdateTodo } from "./updateTodo";
import { useUpdateTodo } from "./useUpdateTodo";
import type { TodoItem } from "./types";

/** Today's todo items, the input draft and the todo shown on the collapsed island. */
export function useTodoList(onStartTodo: () => void) {
  const [todos, setTodos] = useState<TodoItem[]>(loadTodos);
  useUpdateTodo(todos, setTodos);
  const [draftTodo, setDraftTodo] = useState("");
  const [activeTodoId, setActiveTodoId] = useState<string | null>(
    loadActiveTodoId,
  );

  const addTodo = useCallback(() => {
    const title = draftTodo.trim();

    if (!title) {
      return;
    }

    setTodos((currentTodos) => [
      {
        id: createTodoId(),
        title,
        completed: false,
        createdAt: Date.now(),
      },
      ...currentTodos,
    ]);
    setDraftTodo("");
  }, [draftTodo]);

  const toggleTodo = useCallback((id: string) => {
    setTodos((currentTodos) =>
      currentTodos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo,
      ),
    );
    setActiveTodoId((currentId) => (currentId === id ? null : currentId));
  }, []);

  const updateTodoTitle = useCallback((id: string, title: string) => {
    const nextTitle = title.trim();

    if (!nextTitle) {
      return;
    }

    setTodos((currentTodos) =>
      currentTodos.map((todo) =>
        todo.id === id ? { ...todo, title: nextTitle } : todo,
      ),
    );
  }, []);

  const startTodo = useCallback(
    (id: string) => {
      const todo = todos.find((item) => item.id === id);

      if (!todo || todo.completed) {
        return;
      }

      if (activeTodoId === id) {
        setActiveTodoId(null);
        return;
      }

      setActiveTodoId(id);
      onStartTodo();
    },
    [activeTodoId, onStartTodo, todos],
  );

  const deleteTodo = useCallback((id: string) => {
    if (id === UPDATE_TODO_ID) {
      dismissUpdatePrompt();
      return;
    }
    setTodos((currentTodos) => currentTodos.filter((todo) => todo.id !== id));
    setActiveTodoId((currentId) => (currentId === id ? null : currentId));
  }, []);

  const reorderTodo = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId) {
      return;
    }

    setTodos((currentTodos) => {
      const sourceIndex = currentTodos.findIndex((todo) => todo.id === sourceId);
      const targetIndex = currentTodos.findIndex((todo) => todo.id === targetId);

      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
        return currentTodos;
      }

      const nextTodos = [...currentTodos];
      const [movedTodo] = nextTodos.splice(sourceIndex, 1);
      const insertIndex = targetIndex;
      nextTodos.splice(insertIndex, 0, movedTodo);

      return nextTodos;
    });
  }, []);

  useEffect(() => {
    saveTodos(withoutUpdateTodo(todos));
  }, [todos]);

  useEffect(() => {
    saveActiveTodoId(activeTodoId);
  }, [activeTodoId]);

  useEffect(() => {
    if (
      activeTodoId &&
      !todos.some((todo) => todo.id === activeTodoId && !todo.completed)
    ) {
      setActiveTodoId(null);
    }
  }, [activeTodoId, todos]);

  return {
    todos,
    setTodos,
    draftTodo,
    setDraftTodo,
    activeTodoId,
    setActiveTodoId,
    addTodo,
    toggleTodo,
    updateTodoTitle,
    startTodo,
    deleteTodo,
    reorderTodo,
  };
}
