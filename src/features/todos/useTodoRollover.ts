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
  timerTodoIds?: string[];
  saveDirectory: string;
  fileSyncEnabled?: boolean;
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
  timerTodoIds = [],
  saveDirectory,
  fileSyncEnabled = false,
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
        .filter((todo) => !todo.completed && (carryOverIncompleteTodos || timerTodoIds.includes(todo.id)))
        .map((todo, index) => ({
          ...todo,
          id: timerTodoIds.includes(todo.id) ? todo.id : createTodoId(),
          completed: false,
          createdAt: carryOverCreatedAt + index,
        }));

      if (
        fileSyncEnabled || ((todos.length > 0 || dailyNote.trim()) && signature !== lastSavedSignature)
      ) {
        if (saveDirectory.trim()) {
          try {
            const result = await saveTodosToDisk(currentTodoDate, todos, dailyNote);
            // Finish a pending stable-file sample/title edit before archiving this day.
            if (result && typeof result === "object" && "blocked" in result && result.blocked) {
              upsertArchive(currentTodoDate, todos, dailyNote, false);
            } else if (result && typeof result === "object" && "deferred" in result && result.deferred) return;
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
      timerTodoIds,
      currentTodoDate,
      dailyNote,
      onStartDay,
      saveDirectory,
      fileSyncEnabled,
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
