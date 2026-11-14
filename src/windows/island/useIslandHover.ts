import { useCallback } from "react";
import type { IslandSettings } from "../../features/appearance/types";
import { useHoverExpand } from "./useHoverExpand";
import { useHoverFocus } from "./useHoverFocus";
import type { useIslandNavigation } from "./useIslandNavigation";
import { usePanelPreview } from "./usePanelPreview";
import { useTuckedHoverOpen } from "./useTuckedHoverOpen";
import type { IslandPage } from "./types";

type IslandHoverOptions = {
  settings: IslandSettings;
  navigation: ReturnType<typeof useIslandNavigation>;
  /** Game mode keeps the island quiet. */
  quiet: boolean;
  hasMessagePreview: boolean;
  /** The island names a running agent, so opening it shows the Agent page. */
  namesAgent: boolean;
  openEnabledPage: (page: IslandPage) => void;
};

/** Opening the island by hovering it, tucked or not, and the panel preview; returns the tucked island's hover handler. */
export function useIslandHover({ settings, navigation, quiet, hasMessagePreview, namesAgent, openEnabledPage }: IslandHoverOptions) {
  const { mode, page, isTucked, isPeeking, collapseIsland, peekIsland, retractsAfterPeek, resumePeek } = navigation;
  // While the island names a running agent, opening it shows the Agent page.
  const openCurrentPage = useCallback(
    () => openEnabledPage(namesAgent ? "agents" : page),
    [namesAgent, openEnabledPage, page],
  );
  useHoverExpand({
    enabled: settings.expandTrigger === "hover" && !quiet,
    delayMs: settings.hoverExpandDelayMs,
    paused: hasMessagePreview,
    collapseDelayMs: settings.hoverCollapseDelayMs,
    mode,
    // A peeking island opens on a click only; hovering it just keeps it out.
    isTucked: isTucked || isPeeking,
    onExpand: openCurrentPage,
    onCollapse: collapseIsland,
  });
  const hoverTucked = useTuckedHoverOpen({
    opensPanel: settings.tuckedHoverAction === "expand" && !quiet,
    delayMs: settings.hoverExpandDelayMs,
    isPeeking: isPeeking && mode === "collapsed",
    onPeek: peekIsland,
    onOpen: openCurrentPage,
    retractsAfterPeek,
    resumePeek,
  });
  useHoverFocus(mode, quiet);
  usePanelPreview({ navigation, quiet, hasMessagePreview });
  return hoverTucked;
}
