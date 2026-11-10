import { useCallback, useState } from "react";

/**
 * The height the island's settings page needs for its open page, as SettingsPanel measures it;
 * null until the first measure. getExpandedIslandHeight sizes the island to it.
 */
export function useSettingsPageHeight() {
  const [settingsContentHeight, setHeight] = useState<number | null>(null);
  const reportSettingsHeight = useCallback((height: number) => setHeight(height), []);
  return { settingsContentHeight, reportSettingsHeight };
}
