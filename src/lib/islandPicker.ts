import { useSyncExternalStore } from "react";

// A short-lived in-window interaction, shared by the picker and the island's close/focus hooks.
const owners = new Set<symbol>();
const listeners = new Set<() => void>();
export const isIslandPickerOpen = () => owners.size > 0;
const publish = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export function holdIslandPicker() {
  const owner = Symbol();
  owners.add(owner);
  publish();
  return () => { if (owners.delete(owner)) publish(); };
}

export function useIslandPickerOpen() {
  return useSyncExternalStore(subscribe, isIslandPickerOpen, () => false);
}
