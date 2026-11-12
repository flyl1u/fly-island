import { useCallback, useEffect, useRef } from "react";
import { getLocalDateString } from "../../utils/date";
import { getTodoSignature } from "./markdown";
import { clearLastSavedSignature, createTodoId, loadLastSavedSignature, saveLastSavedSignature } from "./storage";
import type { TodoItem } from "./types";

type TodoRolloverOptions = {
  currentTodoDate: string;
  todos: TodoItem[];
  dailyNote: string;
  carryOverIncompleteTodos: boolean;
  /** An explicitly running or expired round stays available across midnight until handled. */
  timerTodoId?: string | null;
  saveDirectory: string;
  saveTodosToDisk: (date: string, todoList: TodoItem[], nextDailyNote: string) => Promise<unknown>;
  upsertArchive: (date: string, todoList: TodoItem[], nextDailyNote: string, savedToDisk: boolean) => void;
  /** Resets the day's state to the new date with the carried-over todos. */
  onStartDay: (nextDate: string, carriedTodos: TodoItem[]) => void;
};

/**
 * Starts a new day when the local date changes (checked on load and every
 * 30s): archives unsaved work, then carries incomplete todos over if enabled.
 */
export function useTodoRollover({
  currentTodoDate,
  todos,
  dailyNote,
  carryOverIncompleteTodos,
  timerTodoId = null,
  saveDirectory,
  saveTodosToDisk,
  upsertArchive,
  onStartDay,
}: TodoRolloverOptions) {
  const didCheckDate = useRef(false);

  const rolloverToToday = useCallback(
    async (nextDate: string) => {
      const signature = getTodoSignature(currentTodoDate, todos, dailyNote);
      const lastSavedSignature = loadLastSavedSignature();
      const carryOverCreatedAt = Date.now();
      const carriedTodos = todos
        .filter((todo) => !todo.completed && (carryOverIncompleteTodos || todo.id === timerTodoId))
        .map((todo, index) => ({
          ...todo,
          id: todo.id === timerTodoId ? todo.id : createTodoId(),
          completed: false,
          createdAt: carryOverCreatedAt + index,
        }));

      if (
        (todos.length > 0 || dailyNote.trim()) &&
        signature !== lastSavedSignature
      ) {
        if (saveDirectory.trim()) {
          try {
            await saveTodosToDisk(currentTodoDate, todos, dailyNote);
          } catch (error) {
            console.error("Failed to auto-save todo markdown", error);
            upsertArchive(currentTodoDate, todos, dailyNote, false);
          }
        } else {
          upsertArchive(currentTodoDate, todos, dailyNote, false);
        }
      }

      onStartDay(nextDate, carriedTodos);

      if (carriedTodos.length > 0) {
        clearLastSavedSignature();
      } else {
        saveLastSavedSignature(getTodoSignature(nextDate, [], ""));
      }
    },
    [
      carryOverIncompleteTodos,
      timerTodoId,
      currentTodoDate,
      dailyNote,
      onStartDay,
      saveDirectory,
      saveTodosToDisk,
      todos,
      upsertArchive,
    ],
  );

  useEffect(() => {
    if (didCheckDate.current) {
      return;
    }

    didCheckDate.current = true;
    const today = getLocalDateString();

    if (currentTodoDate !== today) {
      void rolloverToToday(today);
    }
  }, [currentTodoDate, rolloverToToday]);

  useEffect(() => {
    const checkForNewDay = () => {
      const today = getLocalDateString();

      if (currentTodoDate !== today) {
        void rolloverToToday(today);
      }
    };

    const interval = window.setInterval(checkForNewDay, 30_000);
    return () => window.clearInterval(interval);
  }, [currentTodoDate, rolloverToToday]);
}
