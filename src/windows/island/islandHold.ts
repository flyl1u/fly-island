import { useSyncExternalStore } from "react";

/**
 * Reasons the open island must not close by itself. Eye Care's "break time" holds it until the
 * user answers, so a click outside cannot make the reminder disappear. This is not a lock: the
 * island's own close button, tucking and game mode still apply, and the hold ends with the alert.
 */
const reasons = new Set<string>();
const listeners = new Set<() => void>();
const publish = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const isIslandHeld = () => reasons.size > 0;

/** Holds the island open until the returned function runs; holding twice is harmless. */
export function holdIsland(reason: string) {
  if (!reasons.has(reason)) {
    reasons.add(reason);
    publish();
  }
  return () => {
    if (reasons.delete(reason)) publish();
  };
}

export function useIslandHeld() {
  return useSyncExternalStore(subscribe, isIslandHeld, () => false);
}
