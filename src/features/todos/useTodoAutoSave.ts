import { useEffect, useRef } from "react";
import { getTodoSignature } from "./markdown";
import { loadLastSavedSignature } from "./storage";
import type { SaveState, TodoItem } from "./types";

type TodoAutoSaveOptions = {
  currentTodoDate: string;
  todos: TodoItem[];
  dailyNote: string;
  saveDirectory: string;
  saveTodosToDisk: (date: string, todoList: TodoItem[], nextDailyNote: string) => Promise<unknown>;
  setSaveState: (state: SaveState) => void;
};

/** Writes the day's markdown 700ms after the last edit, skipping the initial load and unchanged content. */
export function useTodoAutoSave({
  currentTodoDate,
  todos,
  dailyNote,
  saveDirectory,
  saveTodosToDisk,
  setSaveState,
}: TodoAutoSaveOptions) {
  const autoSaveTimer = useRef<number | null>(null);
  const autoSaveRequestId = useRef(0);
  const didHydrateAutoSave = useRef(false);

  useEffect(() => {
    if (!didHydrateAutoSave.current) {
      didHydrateAutoSave.current = true;
      return;
    }

    if (autoSaveTimer.current !== null) {
      window.clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = null;
    }

    if (!saveDirectory.trim()) {
      return;
    }

    const signature = getTodoSignature(currentTodoDate, todos, dailyNote);
    const lastSavedSignature = loadLastSavedSignature();

    if (!todos.length && !dailyNote.trim() && !lastSavedSignature) {
      return;
    }

    if (signature === lastSavedSignature) {
      return;
    }

    const timer = window.setTimeout(() => {
      autoSaveTimer.current = null;
      autoSaveRequestId.current += 1;
      const requestId = autoSaveRequestId.current;

      void saveTodosToDisk(currentTodoDate, todos, dailyNote)
        .catch((error) => {
          if (requestId === autoSaveRequestId.current) {
            console.error("Failed to auto-save todo markdown", error);
            setSaveState("error");
          }
        });
    }, 700);

    autoSaveTimer.current = timer;

    return () => {
      if (autoSaveTimer.current === timer) {
        window.clearTimeout(timer);
        autoSaveTimer.current = null;
      }
    };
  }, [
    currentTodoDate,
    dailyNote,
    saveDirectory,
    saveTodosToDisk,
    setSaveState,
    todos,
  ]);

  useEffect(
    () => () => {
      if (autoSaveTimer.current !== null) {
        window.clearTimeout(autoSaveTimer.current);
      }
    },
    [],
  );
}
