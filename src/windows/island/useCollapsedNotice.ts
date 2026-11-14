import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { IslandSettings } from "../../features/appearance/types";
import { isIslandVisible } from "./api";
import type { IslandPage } from "./types";
import type { useIslandNavigation } from "./useIslandNavigation";

export type CollapsedNotice = { text: string; page: IslandPage; expiresAt: number };
export type ShowCollapsedNotice = (text: string, page: IslandPage, durationMs?: number) => void;

/** Internal reminders share the message preview's hold, without opening or replacing a panel. */
export function useCollapsedNotice(settings: IslandSettings, navigation: ReturnType<typeof useIslandNavigation>, quiet: boolean) {
  const [notice, setNotice] = useState<CollapsedNotice | null>(null);
  const latest = useRef({ settings, navigation, quiet });
  const generation = useRef(0);
  useLayoutEffect(() => { latest.current = { settings, navigation, quiet }; });
  useEffect(() => () => { generation.current++; }, []);
  const showNotice: ShowCollapsedNotice = useCallback((text, page, durationMs = 5000) => {
    const id = ++generation.current;
    void isIslandVisible().then((visible) => {
      const current = latest.current;
      if (id !== generation.current || !visible || current.quiet || current.navigation.isPreviewing || current.navigation.mode !== "collapsed") return;
      if (page === "agents" && !current.settings.agentStatusEnabled || page === "todo" && !current.settings.todoEnabled) return;
      if (current.navigation.isTucked && !current.settings.revealOnMessage) return;
      current.navigation.revealForMessage();
      setNotice({ text, page, expiresAt: Date.now() + durationMs });
    }).catch((error: unknown) => console.error("Failed to check island visibility for a reminder", error));
  }, []);
  useEffect(() => {
    if (!notice) return;
    if (quiet || navigation.mode !== "collapsed" || navigation.isTucked || navigation.isPreviewing ||
      notice.page === "agents" && !settings.agentStatusEnabled || notice.page === "todo" && !settings.todoEnabled) {
      setNotice(null);
      return;
    }
    const timer = window.setTimeout(() => setNotice(null), Math.max(0, notice.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [notice, quiet, navigation.mode, navigation.isTucked, navigation.isPreviewing, settings.agentStatusEnabled, settings.todoEnabled]);
  // A manual tuck must cancel the hold in this render, before tucking effects can reveal it again.
  const visibleNotice = navigation.mode === "collapsed" && !navigation.isTucked && !quiet && !navigation.isPreviewing ? notice : null;
  return { notice: visibleNotice, showNotice };
}
