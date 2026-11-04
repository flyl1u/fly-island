import { useCallback } from "react";
import { presentTranslationWindow, toggleTranslationWindow } from "../../features/translation/api";
import { requestTranslationHandoffOpen } from "../../features/translation/storage";
import { useTranslationEnabled } from "../../features/translation/useTranslationEnabled";
import { useTranslationIslandShortcut } from "../../features/translation/useTranslationIslandShortcut";
import type { IslandMode, IslandPage } from "./types";

function reportOpenFailure(error: unknown) {
  console.error("Failed to open translation", error);
}

/**
 * Where translation opens from the island: its own window, or the island's translation
 * page when `inIsland` is on. Covers the header button, the global shortcut and a click
 * on the one-line quick result.
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

  // The flag goes first so the page or window, once shown, opens onto the quick result.
  const openTranslationPeek = useCallback(() => {
    requestTranslationHandoffOpen();
    if (inIsland) openIslandPage("translation");
    else void presentTranslationWindow().catch(reportOpenFailure);
  }, [inIsland, openIslandPage]);

  return { openTranslator, openTranslationPeek };
}
