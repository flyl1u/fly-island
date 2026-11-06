import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/** Whether the window is hidden (the island sent to the tray), following changes. */
export function usePageHidden(): boolean {
  return useSyncExternalStore(subscribe, () => document.hidden, () => false);
}
