import { useCallback } from "react";
import { toggleTranslationWindow } from "../../features/translation/api";
import { useTranslationEnabled } from "../../features/translation/useTranslationEnabled";
import { useTranslationIslandShortcut } from "../../features/translation/useTranslationIslandShortcut";
import type { IslandMode, IslandPage } from "./types";

function reportOpenFailure(error: unknown) {
  console.error("Failed to open translation", error);
}

/**
 * Where translation opens from the island: its own window, or the island's translation
 * page when `inIsland` is on. Covers the header button and the global shortcut.
 */
export function useIslandTranslation(
  enabled: boolean,
  inIsland: boolean,
  mode: IslandMode,
  page: IslandPage,
  openIslandPage: (page: IslandPage) => void,
  collapseIsland: () => void,
) {
  useTranslationEnabled(enabled, inIsland);

  const openTranslator = useCallback(() => {
    if (inIsland) openIslandPage("translation");
    else void toggleTranslationWindow().catch(reportOpenFailure);
  }, [inIsland, openIslandPage]);

  // The shortcut toggles the page, as it toggles the window.
  useTranslationIslandShortcut(enabled && inIsland, () => {
    if (mode === "expanded" && page === "translation") collapseIsland();
    else openIslandPage("translation");
  });

  return { openTranslator };
}
