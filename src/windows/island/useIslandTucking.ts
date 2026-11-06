import { useCallback } from "react";
import type { IslandSettings } from "../../features/appearance/types";
import { useIdleTuck, useRevealOnMessage } from "./useIslandAutomation";
import type { useIslandNavigation } from "./useIslandNavigation";
import { useTuckPeek } from "./useTuckPeek";

type IslandTuckingOptions = {
  settings: IslandSettings;
  navigation: ReturnType<typeof useIslandNavigation>;
  hasMessagePreview: boolean;
  /** A plugin's permission question waits for an answer. */
  hasPermissionPrompt: boolean;
  hasTranslationPeek: boolean;
};

/** Tucking the island away when idle, sliding it out for what needs to be seen, and ending a peek. */
export function useIslandTucking({ settings, navigation, hasMessagePreview, hasPermissionPrompt, hasTranslationPeek }: IslandTuckingOptions) {
  const { mode, page, isTucked, isPeeking, peekRetractDelayMs, idleTuck, revealIsland, endPeek } = navigation;
  // A showing preview holds the idle timer, which then restarts in full once it ends.
  const tuckWhenIdle = useCallback(
    () => idleTuck(settings.autoTuckRetract ? settings.autoTuckRetractDelayMs : null),
    [idleTuck, settings.autoTuckRetract, settings.autoTuckRetractDelayMs],
  );
  useIdleTuck(settings.autoTuck && !hasMessagePreview && !hasTranslationPeek, settings.autoTuckSeconds, isTucked, `${mode}:${page}`, tuckWhenIdle);
  useRevealOnMessage(hasMessagePreview, isTucked, revealIsland);
  // A plugin waits for this answer, so it is shown even when tucked away.
  useRevealOnMessage(hasPermissionPrompt, isTucked, revealIsland);
  useRevealOnMessage(hasTranslationPeek, isTucked && settings.revealOnMessage, revealIsland);
  useTuckPeek(isPeeking, endPeek, peekRetractDelayMs ?? undefined);
}
