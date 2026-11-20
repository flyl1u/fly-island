import { useCallback, useEffect, useState } from "react";
import { setMediaShortcuts } from "./api";
import { loadMusicShortcuts, MUSIC_SHORTCUTS_SAVED_EVENT, MUSIC_SHORTCUTS_STORAGE_KEY, saveMusicShortcuts } from "./storage";
import type { MusicShortcuts } from "./shortcuts";

/** Settings copies observe storage; only the main window's media hook owns registration. */
export function useMusicShortcuts() {
  const [shortcuts, setShortcuts] = useState(loadMusicShortcuts);
  useEffect(() => {
    const reload = () => setShortcuts(loadMusicShortcuts());
    const sync = (event: StorageEvent) => {
      if (event.key === MUSIC_SHORTCUTS_STORAGE_KEY || event.key === null) reload();
    };
    window.addEventListener("storage", sync);
    window.addEventListener(MUSIC_SHORTCUTS_SAVED_EVENT, reload);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(MUSIC_SHORTCUTS_SAVED_EVENT, reload);
    };
  }, []);
  const update = useCallback((next: MusicShortcuts) => {
    saveMusicShortcuts(next);
    setShortcuts(next);
  }, []);
  return [shortcuts, update] as const;
}

/** Runs even when the island is collapsed, tucked or hidden and Settings was never opened. */
export function useMusicShortcutRegistration(enabled: boolean, target?: string) {
  const [shortcuts] = useMusicShortcuts();
  const { playPause, previous, next } = shortcuts;
  useEffect(() => {
    void setMediaShortcuts(enabled, { playPause, previous, next }, target)
      .catch((error) => console.error("Failed to update music shortcuts", error));
  }, [enabled, playPause, previous, next, target]);
}
