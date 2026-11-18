import { useCallback } from "react";
import type { IslandSettings } from "../../features/appearance/types";
import { useHoverExpand } from "./useHoverExpand";
import { useHoverFocus } from "./useHoverFocus";
import type { useIslandNavigation } from "./useIslandNavigation";
import { usePanelPreview } from "./usePanelPreview";
import { useTuckedHoverOpen } from "./useTuckedHoverOpen";
import { tuckedHoverOpensPanel } from "./tuckedHover";
import type { IslandPage } from "./types";
import { useIslandPickerOpen } from "../../lib/islandPicker";

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
  const pickerOpen = useIslandPickerOpen();
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
    pickerOpen,
    collapseDelayMs: settings.hoverCollapseDelayMs,
    mode,
    // A tucked island under the cursor is opened by useTuckedHoverOpen below (slide out, then
    // the panel, one step), so useHoverExpand disarms on the slide-out and does not open it a
    // second time; a cursor that leaves and comes back opens it as usual. Treating
    // a peeking island as still tucked left hover-open dead after the first tuck until a click.
    isTucked,
    onExpand: openCurrentPage,
    onCollapse: collapseIsland,
  });
  const hoverTucked = useTuckedHoverOpen({
    opensPanel: tuckedHoverOpensPanel(settings.expandTrigger, quiet),
    delayMs: settings.hoverExpandDelayMs,
    isPeeking: isPeeking && mode === "collapsed",
    onPeek: peekIsland,
    onOpen: openCurrentPage,
    blocked: quiet,
    retractsAfterPeek,
    resumePeek,
  });
  useHoverFocus(mode, quiet, pickerOpen, settings.hoverCollapseDelayMs);
  usePanelPreview({ navigation, quiet, hasMessagePreview });
  return hoverTucked;
}
