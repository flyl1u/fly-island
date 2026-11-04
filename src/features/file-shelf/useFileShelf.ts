import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getErrorMessage } from "../../utils/error.ts";
import {
  addFileShelfPaths,
  clearFileShelf,
  copyFileShelfItems,
  getFileShelf,
  openFileShelfItem,
  removeFileShelfItem,
  revealFileShelfItem,
  startFileShelfDrag,
  type FileShelfItem,
  type FileShelfSnapshot,
} from "./api";

export type FileShelfController = ReturnType<typeof useFileShelf>;

/** Shelf entries, their actions, and the last native error to show on the page. */
export function useFileShelf(enabled: boolean) {
  const [items, setItems] = useState<FileShelfItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Set while a shelf item is being dragged out, so dropping it back on the island
  // is not taken as a new file arriving.
  const draggingOutRef = useRef(false);

  const run = useCallback(async (action: () => Promise<FileShelfSnapshot | void>) => {
    try {
      const snapshot = await action();
      if (snapshot) setItems(snapshot.items);
      setError(null);
      return true;
    } catch (caught) {
      setError(getErrorMessage(caught));
      return false;
    }
  }, []);

  const refresh = useCallback(() => run(getFileShelf), [run]);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  const addPaths = useCallback(async (paths: string[]) => {
    if (draggingOutRef.current || paths.length === 0) return false;
    return run(() => addFileShelfPaths(paths));
  }, [run]);

  const startDrag = useCallback(async (id: string) => {
    if (draggingOutRef.current) return;
    draggingOutRef.current = true;
    try {
      await run(() => startFileShelfDrag([id]));
    } finally {
      draggingOutRef.current = false;
    }
  }, [run]);

  const isDraggingOut = useCallback(() => draggingOutRef.current, []);

  return useMemo(() => ({
    items,
    error,
    refresh,
    addPaths,
    startDrag,
    isDraggingOut,
    remove: (id: string) => run(() => removeFileShelfItem(id)),
    clear: () => run(clearFileShelf),
    copy: (id: string) => run(() => copyFileShelfItems([id])),
    open: (id: string) => run(() => openFileShelfItem(id)),
    reveal: (id: string) => run(() => revealFileShelfItem(id)),
  }), [addPaths, error, isDraggingOut, items, refresh, run, startDrag]);
}
