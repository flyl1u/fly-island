import { useCallback, useEffect, useState } from "react";
import { loadTodoFileSync, saveTodoFileSync, TODO_FILE_SYNC_CHANGED_EVENT, TODO_FILE_SYNC_STORAGE_KEY } from "./storage";

/** Shared by embedded settings and the island; storage events also cover detached settings. */
export function useTodoFileSyncSetting() {
  const [enabled, setEnabled] = useState(loadTodoFileSync);
  useEffect(() => {
    const reload = () => setEnabled(loadTodoFileSync());
    const sync = (event: StorageEvent) => {
      if (event.key === null || event.key === TODO_FILE_SYNC_STORAGE_KEY) reload();
    };
    window.addEventListener("storage", sync);
    window.addEventListener(TODO_FILE_SYNC_CHANGED_EVENT, reload);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(TODO_FILE_SYNC_CHANGED_EVENT, reload);
    };
  }, []);
  const change = useCallback((next: boolean) => { saveTodoFileSync(next); }, []);
  return { enabled, onChange: change };
}
