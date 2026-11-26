import { useCallback, useEffect, useRef, useState } from "react";
import { isNativePluginPage, isPluginPage, standalonePages, type PlacedPlugin } from "../../features/plugins/placement.ts";
import type { SettingsCategory } from "./categories";

/**
 * A plugin's own page goes away with the plugin. A page that was open then returns to Plugins; a
 * link to a packaged plugin's page that arrives before the first plugin snapshot waits for it.
 */
export function useAvailableCategory(
  category: SettingsCategory,
  placed: readonly PlacedPlugin[],
  setCategory: (category: SettingsCategory) => void,
): SettingsCategory {
  const available = !isPluginPage(category) || standalonePages(placed).some((plugin) => plugin.category === category);
  const shown = useRef<SettingsCategory | null>(null);
  useEffect(() => {
    if (available) shown.current = category;
    else if (shown.current === category || isNativePluginPage(category)) setCategory("plugins");
  }, [available, category, setCategory]);
  return available ? category : "plugins";
}

/** Opens the page a plugin declared and, on a shared page, scrolls to its group. */
export function useOpenPluginSettings(setCategory: (category: SettingsCategory) => void) {
  const [anchor, setAnchor] = useState<string | null>(null);
  useEffect(() => {
    if (anchor === null) return;
    // The groups above can still be settling in this frame.
    const frame = requestAnimationFrame(() => {
      const group = document.querySelector<HTMLElement>(`.editor-panel [data-plugin-group="${CSS.escape(anchor)}"]`);
      const panel = group?.closest<HTMLElement>(".editor-panel");
      // Only the page scrolls: scrollIntoView would also move the island around the panel.
      if (group && panel) panel.scrollTop += group.getBoundingClientRect().top - panel.getBoundingClientRect().top - 8;
      setAnchor(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [anchor]);
  return useCallback((plugin: PlacedPlugin) => {
    setCategory(plugin.category);
    // A standalone page is the plugin's own, so it opens from the top.
    setAnchor(plugin.standalone ? null : plugin.id);
  }, [setCategory]);
}
