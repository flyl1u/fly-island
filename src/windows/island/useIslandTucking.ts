import { useCallback, useEffect, useState } from "react";
import type { IslandSettings } from "../../features/appearance/types";
import { listenIslandHover } from "./api";
import { idlePlan } from "./idleCollapse";
import { keepIslandVisible, keepVisibleChangesAt } from "./keepVisible";
import { retractsPeek, revealsForKeepVisible } from "./tuckRules";
import { useIdleTuck, useRevealOnMessage } from "./useIslandAutomation";
import { isEditingText } from "./useHoverExpand";
import type { useIslandNavigation } from "./useIslandNavigation";
import { useTuckPeek } from "./useTuckPeek";

type IslandTuckingOptions = {
  settings: IslandSettings;
  navigation: ReturnType<typeof useIslandNavigation>;
  hasMessagePreview: boolean;
  /** What "Stay visible while…" looks at (keepVisible.ts). */
  activity: Parameters<typeof keepIslandVisible>[1];
  /** Game mode holds the island back or tucked it; keep-visible does not undo that. */
  gameHolds: boolean;
};

/**
 * Collapsing the open island once the cursor has been away long enough (A), tucking the
 * collapsed island away when idle (B), sliding it out for what needs to be seen, and ending a peek.
 */
export function useIslandTucking({ settings, navigation, hasMessagePreview, activity, gameHolds }: IslandTuckingOptions) {
  const { mode, page, isTucked, isPeeking, peekRetractDelayMs, tuckedAutomatically, idleTuck, collapseIsland, revealIsland, revealForMessage, endPeek } = navigation;
  const isHovering = useIslandHovering();
  const keepVisible = useKeepVisible(settings, activity);
  const tuckState = {
    isTucked, isPeeking, tuckedAutomatically, keepVisible, hasMessagePreview, isPreviewing: navigation.isPreviewing, gameHolds,
  };
  const revealForActivity = revealsForKeepVisible(tuckState);
  useEffect(() => {
    if (revealForActivity) revealIsland();
  }, [revealForActivity, revealIsland]);
  // A showing preview holds the idle timer, which then restarts in full once it ends.
  const tuckWhenIdle = useCallback(
    () => idleTuck(settings.autoTuckRetract ? settings.autoTuckRetractDelayMs : null),
    [idleTuck, settings.autoTuckRetract, settings.autoTuckRetractDelayMs],
  );
  // Closing under a draft would lose it; the next keystroke or move starts the wait again.
  const collapseWhenIdle = useCallback(() => {
    if (!isEditingText()) collapseIsland();
  }, [collapseIsland]);
  const plan = navigation.isPreviewing ? null : idlePlan(mode, settings, hasMessagePreview, isHovering, keepVisible);
  useIdleTuck(
    plan !== null,
    plan?.seconds ?? 0,
    isTucked,
    `${mode}:${page}`,
    plan?.action === "collapse" ? collapseWhenIdle : tuckWhenIdle,
  );
  useRevealOnMessage(hasMessagePreview, isTucked, revealForMessage);
  // A preview holds the peek; the island slides back once it has gone and the cursor is away.
  useTuckPeek(retractsPeek(tuckState), endPeek, peekRetractDelayMs ?? undefined);
}

/**
 * Whether "Stay visible while…" holds the island now. Re-checked when a todo timer that holds it
 * runs out, which nothing else re-renders for: the island used to stay out after the timer ended.
 */
function useKeepVisible(settings: IslandSettings, activity: IslandTuckingOptions["activity"]) {
  const [, rerender] = useState(0);
  const now = Date.now();
  const changesAt = keepVisibleChangesAt(settings, activity, now);
  useEffect(() => {
    if (changesAt === null) return;
    const timer = window.setTimeout(() => rerender((count) => count + 1), Math.max(0, changesAt - Date.now()) + 50);
    return () => window.clearTimeout(timer);
  }, [changesAt]);
  return keepIslandVisible(settings, activity, now);
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
