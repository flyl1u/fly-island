import { useCallback, useEffect, useState } from "react";
import type { PluginPagePrefs } from "./pagePrefs";
import { loadPluginPagePrefs, savePluginPagePrefs, subscribePluginPagePrefs } from "./storage";

/** The plugin page order and hidden pages, kept in step between the settings and island windows. */
export function usePluginPagePrefs() {
  const [prefs, setPrefs] = useState<PluginPagePrefs>(loadPluginPagePrefs);

  useEffect(() => subscribePluginPagePrefs(setPrefs), []);

  const update = useCallback((next: PluginPagePrefs) => {
    setPrefs(next);
    savePluginPagePrefs(next);
  }, []);

  return [prefs, update] as const;
}
