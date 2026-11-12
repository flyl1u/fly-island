import { useCallback, useEffect, useState } from "react";
import type { IslandSettings } from "../../features/appearance/types";
import { listenIslandHover } from "./api";
import { idlePlan } from "./idleCollapse";
import { useIdleTuck, useRevealOnMessage } from "./useIslandAutomation";
import { isEditingText } from "./useHoverExpand";
import type { useIslandNavigation } from "./useIslandNavigation";
import { useTuckPeek } from "./useTuckPeek";

type IslandTuckingOptions = {
  settings: IslandSettings;
  navigation: ReturnType<typeof useIslandNavigation>;
  hasMessagePreview: boolean;
};

/**
 * Collapsing the open island once the cursor has been away long enough (A), tucking the
 * collapsed island away when idle (B), sliding it out for what needs to be seen, and ending a peek.
 */
export function useIslandTucking({ settings, navigation, hasMessagePreview }: IslandTuckingOptions) {
  const { mode, page, isTucked, isPeeking, peekRetractDelayMs, idleTuck, collapseIsland, revealIsland, endPeek } = navigation;
  const isHovering = useIslandHovering();
  // A showing preview holds the idle timer, which then restarts in full once it ends.
  const tuckWhenIdle = useCallback(
    () => idleTuck(settings.autoTuckRetract ? settings.autoTuckRetractDelayMs : null),
    [idleTuck, settings.autoTuckRetract, settings.autoTuckRetractDelayMs],
  );
  // Closing under a draft would lose it; the next keystroke or move starts the wait again.
  const collapseWhenIdle = useCallback(() => {
    if (!isEditingText()) collapseIsland();
  }, [collapseIsland]);
  const plan = idlePlan(mode, settings, hasMessagePreview, isHovering);
  useIdleTuck(
    plan !== null,
    plan?.seconds ?? 0,
    isTucked,
    `${mode}:${page}`,
    plan?.action === "collapse" ? collapseWhenIdle : tuckWhenIdle,
  );
  useRevealOnMessage(hasMessagePreview, isTucked, revealIsland);
  useTuckPeek(isPeeking, endPeek, peekRetractDelayMs ?? undefined);
}

/** Whether the cursor is over the island, from the native hover events. */
function useIslandHovering() {
  const [isHovering, setIsHovering] = useState(false);
  useEffect(() => {
    let didCancel = false;
    let unlisten: (() => void) | null = null;
    void listenIslandHover(setIsHovering)
      .then((next) => {
        if (didCancel) next();
        else unlisten = next;
      })
      .catch((error) => console.error("Failed to listen for island hover", error));
    return () => {
      didCancel = true;
      unlisten?.();
    };
  }, []);
  return isHovering;
}
