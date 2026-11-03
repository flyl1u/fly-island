import { useCallback, useEffect, useRef, useState } from "react";
import { saveTodoMarkdown } from "./api";
import { formatTodoDocumentAsMarkdown, getTodoSignature } from "./markdown";
import { saveLastSavedSignature } from "./storage";
import type { SaveState, TodoItem } from "./types";
import { useTodoAutoSave } from "./useTodoAutoSave";
import { useTodoSaveDirectory } from "./useTodoSaveDirectory";

type UpsertArchive = (
  date: string,
  todoList: TodoItem[],
  nextDailyNote: string,
  savedToDisk: boolean,
  filePath?: string,
) => void;

type TodoSavingOptions = {
  currentTodoDate: string;
  todos: TodoItem[];
  dailyNote: string;
  upsertArchive: UpsertArchive;
  /** Called when a manual save has no directory to write to. */
  onMissingSaveDirectory: () => void;
};

/** Saving the day as markdown: the save directory, manual save with its status, and auto-save. */
export function useTodoSaving({
  currentTodoDate,
  todos,
  dailyNote,
  upsertArchive,
  onMissingSaveDirectory,
}: TodoSavingOptions) {
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveStateResetTimer = useRef<number | null>(null);
  const clearNeedsPath = useCallback(() => {
    setSaveState((current) => (current === "needs-path" ? "idle" : current));
  }, []);
  const saveDirectory = useTodoSaveDirectory(clearNeedsPath);

  const saveTodosToDisk = useCallback(
    async (date: string, todoList: TodoItem[], nextDailyNote: string) => {
      const directory = saveDirectory.trim();

      if (!directory) {
        throw new Error("Missing todo save path.");
      }

      const result = await saveTodoMarkdown(
        directory,
        date,
        formatTodoDocumentAsMarkdown(todoList, nextDailyNote),
      );

      upsertArchive(date, todoList, nextDailyNote, true, result.filePath);
      saveLastSavedSignature(getTodoSignature(date, todoList, nextDailyNote));

      return result;
    },
    [saveDirectory, upsertArchive],
  );

  const showTodoSavedState = useCallback(() => {
    if (saveStateResetTimer.current !== null) {
      window.clearTimeout(saveStateResetTimer.current);
    }

    setSaveState("saved");
    saveStateResetTimer.current = window.setTimeout(() => {
      setSaveState("idle");
      saveStateResetTimer.current = null;
    }, 1200);
  }, []);

  const saveTodayTodos = useCallback(async () => {
    if (!saveDirectory.trim()) {
      setSaveState("needs-path");
      onMissingSaveDirectory();
      return;
    }

    setSaveState("saving");

    try {
      await saveTodosToDisk(currentTodoDate, todos, dailyNote);
      showTodoSavedState();
    } catch (error) {
      console.error("Failed to save todo markdown", error);
      setSaveState("error");
    }
  }, [
    currentTodoDate,
    dailyNote,
    onMissingSaveDirectory,
    saveDirectory,
    saveTodosToDisk,
    showTodoSavedState,
    todos,
  ]);

  useTodoAutoSave({
    currentTodoDate,
    todos,
    dailyNote,
    saveDirectory,
    saveTodosToDisk,
    setSaveState,
  });

  useEffect(
    () => () => {
      if (saveStateResetTimer.current !== null) {
        window.clearTimeout(saveStateResetTimer.current);
      }
    },
    [],
  );

  return { saveDirectory, saveState, saveTodosToDisk, saveTodayTodos };
}
