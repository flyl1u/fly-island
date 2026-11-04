import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { getLocalDateString } from "../../utils/date";
import { sortScheduledTodos, splitDueTodos, toTodoItems } from "./schedule";
import { createTodoId, loadScheduledTodos, saveScheduledTodos } from "./storage";
import type { ScheduledTodo, TodoItem } from "./types";
import { useTodoFileField } from "./useTodoFileField";

/**
 * Todos planned for later days. Once the list on screen is today's list, every
 * scheduled todo whose day has come moves to the top of it. A list left over from
 * an earlier day waits for the rollover, so due todos are not archived with it.
 */
export function useScheduledTodos(
  currentTodoDate: string,
  setTodos: Dispatch<SetStateAction<TodoItem[]>>,
) {
  const [scheduledTodos, setScheduledTodos] = useState<ScheduledTodo[]>(loadScheduledTodos);
  useTodoFileField("scheduled", setScheduledTodos);

  useEffect(() => {
    saveScheduledTodos(scheduledTodos);
  }, [scheduledTodos]);

  useEffect(() => {
    if (currentTodoDate !== getLocalDateString()) {
      return;
    }

    const { due, later } = splitDueTodos(scheduledTodos, currentTodoDate);

    if (due.length === 0) {
      return;
    }

    setScheduledTodos(later);
    // Ids are kept, so a repeated run cannot add the same todo twice.
    setTodos((currentTodos) => [
      ...toTodoItems(due).filter((todo) => !currentTodos.some((item) => item.id === todo.id)),
      ...currentTodos,
    ]);
  }, [currentTodoDate, scheduledTodos, setTodos]);

  const scheduleTodo = useCallback((title: string, date: string): ScheduledTodo => {
    const todo = { id: createTodoId(), title, date, createdAt: Date.now() };
    setScheduledTodos((current) => sortScheduledTodos([...current, todo]));
    return todo;
  }, []);

  const deleteScheduledTodo = useCallback((id: string) => {
    setScheduledTodos((current) => current.filter((todo) => todo.id !== id));
  }, []);

  return { scheduledTodos, scheduleTodo, deleteScheduledTodo };
}
