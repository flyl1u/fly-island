import { useCallback, useEffect, useState } from "react";
import type { IslandSettings } from "../../features/appearance/types";
import { listenIslandHover } from "./api";
import { idlePlan } from "./idleCollapse";
import { keepVisibleReason, keepVisibleChangesAt } from "./keepVisible";
import { logDiagnostic } from "../../features/diagnostics/api";
import { canAutoTuck, retractsPeek, revealsForKeepVisible } from "./tuckRules";
import { useBrowserAutoTuck, useIdleTuck, useRevealOnMessage } from "./useIslandAutomation";
import { isEditingText } from "./useHoverExpand";
import type { useIslandNavigation } from "./useIslandNavigation";
import { useTuckPeek } from "./useTuckPeek";
import { isIslandPickerOpen, useIslandPickerOpen } from "../../lib/islandPicker";

type IslandTuckingOptions = {
  settings: IslandSettings;
  navigation: ReturnType<typeof useIslandNavigation>;
  hasMessagePreview: boolean;
  /** What "Stay visible while…" looks at (keepVisible.ts). */
  activity: Parameters<typeof keepVisibleReason>[1];
  /** Game mode holds the island back or tucked it; keep-visible does not undo that. */
  gameHolds: boolean;
  browserOnIslandMonitor?: boolean;
};

/**
 * Collapsing the open island once the cursor has been away long enough (A), tucking the
 * collapsed island away when idle (B), sliding it out for what needs to be seen, and ending a peek.
 */
export function useIslandTucking({ settings, navigation, hasMessagePreview, activity, gameHolds, browserOnIslandMonitor }: IslandTuckingOptions) {
  const { mode, page, isTucked, isPeeking, peekRetractDelayMs, tuckSource, idleTuck, collapseIsland, revealIsland, revealForMessage, endPeek } = navigation;
  const isHovering = useIslandHovering();
  const pickerOpen = useIslandPickerOpen();
  const holdReason = useKeepVisible(settings, activity);
  const keepVisible = holdReason !== null;
  const browserEnabled = canAutoTuck(settings, "browser");
  const browserActive = browserEnabled && browserOnIslandMonitor === true;
  const revealForBrowser = useCallback(() => revealIsland("browser"), [revealIsland]);
  useRevealOnMessage(hasMessagePreview, isTucked, revealForMessage);
  useBrowserAutoTuck({
    enabled: browserEnabled, browserOnIslandMonitor: browserActive, isTucked, tuckSource,
    isHovering, gameHolds, hasMessagePreview, isPreviewing: navigation.isPreviewing,
  }, navigation.tuckForBrowser, revealForBrowser);
  const tuckState = {
    isTucked, isPeeking, tuckedAutomatically: tuckSource === "idle", keepVisible, hasMessagePreview, isPreviewing: navigation.isPreviewing, gameHolds,
  };
  const revealForActivity = !browserActive && revealsForKeepVisible(tuckState);
  useEffect(() => {
    if (revealForActivity) revealIsland("keep_visible");
  }, [revealForActivity, revealIsland]);
  // A showing preview holds the idle timer, which then restarts in full once it ends.
  const tuckWhenIdle = useCallback(
    () => idleTuck(settings.autoTuckRetract ? settings.autoTuckRetractDelayMs : null),
    [idleTuck, settings.autoTuckRetract, settings.autoTuckRetractDelayMs],
  );
  // Closing under a draft would lose it; the next keystroke or move starts the wait again.
  const collapseWhenIdle = useCallback(() => {
    if (!isEditingText() && !isIslandPickerOpen()) collapseIsland("idle_timer");
    else logDiagnostic("island", "collapse_blocked", { reason: "editing_or_picker" });
  }, [collapseIsland]);
  const plan = navigation.isPreviewing || pickerOpen || browserActive ? null : idlePlan(mode, settings, hasMessagePreview, isHovering, keepVisible);
  const tuckBlocked = !browserActive && mode === "collapsed" && !isTucked && canAutoTuck(settings, "idle_timer")
    ? navigation.isPreviewing ? "panel_preview" : pickerOpen ? "picker_open" : hasMessagePreview ? "message" : holdReason
    : null;
  useEffect(() => {
    if (tuckBlocked) logDiagnostic("island", "tuck_blocked", { reason: tuckBlocked });
  }, [tuckBlocked]);
  useIdleTuck(
    plan !== null,
    plan?.seconds ?? 0,
    isTucked,
    `${mode}:${page}`,
    plan?.action === "collapse" ? collapseWhenIdle : tuckWhenIdle,
  );
  // A preview holds the peek; the island slides back once it has gone and the cursor is away.
  useTuckPeek(tuckSource !== "browser" && retractsPeek(tuckState), endPeek, peekRetractDelayMs ?? undefined);
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
  return keepVisibleReason(settings, activity, now);
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
