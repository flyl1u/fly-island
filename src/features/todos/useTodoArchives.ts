import { useCallback, useEffect, useState } from "react";
import { loadTodoArchives, saveTodoArchives } from "./storage";
import type { TodoArchive, TodoItem } from "./types";

/** Archived days, newest first; one entry per date. */
export function useTodoArchives() {
  const [archives, setArchives] = useState<TodoArchive[]>(loadTodoArchives);

  const upsertArchive = useCallback(
    (
      date: string,
      todoList: TodoItem[],
      nextDailyNote: string,
      savedToDisk: boolean,
      filePath?: string,
    ) => {
      const archive: TodoArchive = {
        date,
        todos: todoList,
        dailyNote: nextDailyNote,
        savedAt: Date.now(),
        savedToDisk,
        filePath,
      };

      setArchives((currentArchives) =>
        [archive, ...currentArchives.filter((item) => item.date !== date)].sort(
          (a, b) => b.date.localeCompare(a.date),
        ),
      );
    },
    [],
  );

  useEffect(() => {
    saveTodoArchives(archives);
  }, [archives]);

  return { archives, upsertArchive };
}
