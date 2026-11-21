import { moveItem } from "../../utils/order.ts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createTodoId, loadActiveTodoIds, loadTodos, saveActiveTodoIds, saveTodos } from "./storage";
import { dismissUpdatePrompt } from "../updater/updaterController";
import { UPDATE_TODO_ID } from "./updateTodo";
import { useUpdateTodo } from "./useUpdateTodo";
import { useTodoTimer } from "./useTodoTimer";
import type { TodoDuration, TodoTimer } from "./timer";
import type { TodoItem } from "./types";
/** Today's todo items, the input draft and the todo shown on the collapsed island. */
export function useTodoList(onStartTodo: () => void, onTimerExpired?: () => void, todoTimerEnabled = false, rotateTodos = false, onTimerReminder?: (round: TodoTimer) => void, timerReminder = false) {
  const [todos, setTodos] = useState<TodoItem[]>(loadTodos);
  useUpdateTodo(todos, setTodos);
  const [draftTodo, setDraftTodo] = useState("");
  const [storedActiveIds, setActiveTodoIds] = useState(loadActiveTodoIds);
  const validActiveIds = useMemo(() => storedActiveIds.filter((id) =>
    todos.some((todo) => todo.id === id && !todo.completed && todo.kind !== "update")), [storedActiveIds, todos]);
  const { timer, timers, durations, startTimer, chooseDuration, clearTimer } = useTodoTimer(todos, validActiveIds, onTimerExpired, todoTimerEnabled, onTimerReminder, timerReminder);
  const activeTodoIds = useMemo(() => {
    if (rotateTodos) return validActiveIds;
    // Only the primary todo can stay active without a timer when rotation is off.
    const timedIds = new Set(timers.map((round) => round.todoId));
    return validActiveIds.filter((id, index) => index === 0 || timedIds.has(id));
  }, [rotateTodos, timers, validActiveIds]);
  const activeTodoId = activeTodoIds[0] ?? null;

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
    setActiveTodoIds((ids) => ids.filter((currentId) => currentId !== id));
    clearTimer(id);
  }, [clearTimer]);

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
    (id: string, duration?: TodoDuration, remindMinutes = 0) => {
      const todo = todos.find((item) => item.id === id);

      if (!todo || todo.completed || todo.kind === "update") {
        return;
      }

      if (activeTodoIds.includes(id) && duration === undefined) {
        setActiveTodoIds((ids) => ids.filter((currentId) => currentId !== id));
        clearTimer(id);
        return;
      }

      if (!startTimer(id, duration ?? null, remindMinutes)) return;
      setActiveTodoIds((ids) => {
        if (rotateTodos) return ids.includes(id) ? ids : [...ids, id];
        return [id, ...ids.filter((currentId) => currentId !== id)];
      });
      if (!rotateTodos) onStartTodo();
    },
    [activeTodoIds, clearTimer, onStartTodo, rotateTodos, startTimer, todos],
  );

  const deleteTodo = useCallback((id: string) => {
    if (id === UPDATE_TODO_ID) {
      dismissUpdatePrompt();
      return;
    }
    setTodos((currentTodos) => currentTodos.filter((todo) => todo.id !== id));
    setActiveTodoIds((ids) => ids.filter((currentId) => currentId !== id));
    clearTimer(id);
  }, [clearTimer]);

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

  const moveTodoToIndex = useCallback((id: string, index: number) => {
    setTodos((items) => {
      const item = items.find((todo) => todo.id === id);
      return item ? moveItem(items, item, index) : items;
    });
  }, []);

  useEffect(() => {
    saveTodos(todos);
  }, [todos]);

  useEffect(() => {
    saveActiveTodoIds(activeTodoIds);
  }, [activeTodoIds]);

  useEffect(() => {
    if (activeTodoIds.length !== storedActiveIds.length) setActiveTodoIds(activeTodoIds);
  }, [activeTodoIds, storedActiveIds]);

  return {
    todos,
    setTodos,
    draftTodo,
    setDraftTodo,
    activeTodoId,
    activeTodoIds,
    timer,
    timers,
    durations,
    chooseDuration,
    setActiveTodoIds,
    addTodo,
    toggleTodo,
    updateTodoTitle,
    startTodo,
    deleteTodo,
    reorderTodo,
    moveTodoToIndex,
  };
}
