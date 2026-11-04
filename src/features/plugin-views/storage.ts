import { readJson, writeJson } from "../../lib/storage.ts";
import { normalizePluginPagePrefs, type PluginPagePrefs } from "./pagePrefs.ts";

/** `{ order: string[], hidden: string[] }` of plugin page ids (`plugin:<plugin id>/<view id>`). */
export const PLUGIN_PAGES_STORAGE_KEY = "focusd-island-plugin-pages";

export function loadPluginPagePrefs(): PluginPagePrefs {
  return normalizePluginPagePrefs(readJson(PLUGIN_PAGES_STORAGE_KEY));
}

export function savePluginPagePrefs(prefs: PluginPagePrefs) {
  return writeJson(PLUGIN_PAGES_STORAGE_KEY, prefs);
}

/** Calls `onChange` when another window (the settings window) saved new preferences; returns the unsubscribe function. */
export function subscribePluginPagePrefs(onChange: (prefs: PluginPagePrefs) => void) {
  const listener = (event: StorageEvent) => {
    if (event.key === PLUGIN_PAGES_STORAGE_KEY) onChange(loadPluginPagePrefs());
  };
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}
