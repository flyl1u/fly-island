import { useCallback } from "react";
import type { IslandSettings } from "../../features/appearance/types";
import { idlePlan } from "./idleCollapse";
import { useIdleTuck, useRevealOnMessage } from "./useIslandAutomation";
import type { useIslandNavigation } from "./useIslandNavigation";
import { useTuckPeek } from "./useTuckPeek";

type IslandTuckingOptions = {
  settings: IslandSettings;
  navigation: ReturnType<typeof useIslandNavigation>;
  hasMessagePreview: boolean;
};

/**
 * Closing an open panel and tucking the island away when idle, sliding it out for what needs to
 * be seen, and ending a peek.
 */
export function useIslandTucking({ settings, navigation, hasMessagePreview }: IslandTuckingOptions) {
  const { mode, page, isTucked, isPeeking, peekRetractDelayMs, idleTuck, collapseIsland, revealIsland, endPeek } = navigation;
  // A showing preview holds the idle timer, which then restarts in full once it ends.
  const tuckWhenIdle = useCallback(
    () => idleTuck(settings.autoTuckRetract ? settings.autoTuckRetractDelayMs : null),
    [idleTuck, settings.autoTuckRetract, settings.autoTuckRetractDelayMs],
  );
  const plan = idlePlan(mode, settings, hasMessagePreview);
  useIdleTuck(
    plan !== null,
    plan?.seconds ?? 0,
    isTucked,
    `${mode}:${page}`,
    plan?.action === "collapse" ? collapseIsland : tuckWhenIdle,
  );
  useRevealOnMessage(hasMessagePreview, isTucked, revealIsland);
  useTuckPeek(isPeeking, endPeek, peekRetractDelayMs ?? undefined);
}
