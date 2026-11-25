import { useCallback, useEffect, useRef, useState } from "react";
import type { IslandMode, IslandPage } from "./types";
import type { PreviewSnapshot } from "./panelPreviewPlan";
import { openDetachedClipboardHistory } from "../clipboard/api";
import { showClipboardHistoryIsland } from "../../features/clipboard/api";
import { loadLastPage, saveLastPage } from "./lastPage";
import type { IslandModeReason } from "./diagnosticMode";
import { useModeDiagnostics } from "./useModeDiagnostics";

/** Collapsed / expanded / tucked mode and the open page of the island. */
export function useIslandNavigation() {
  const [mode, setMode] = useState<IslandMode>("collapsed");
  const [isTucked, setIsTucked] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  // Tucked by the minimize button: hovering only peeks the island out, and it slides
  // back once the cursor leaves. A click (or anything else that reveals it) ends this.
  const [isPeekTuck, setIsPeekTuck] = useState(false);
  // How long a peeking island waits after the cursor leaves; null keeps the minimize default.
  const [peekRetractDelayMs, setPeekRetractDelayMs] = useState<number | null>(null);
  // The current tuck came from the idle timer: "stay visible while…" may undo it (tuckRules.ts).
  const [tuckedAutomatically, setTuckedAutomatically] = useState(false);
  const [page, setPage] = useState<IslandPage>(loadLastPage);
  const markMode = useModeDiagnostics(mode, isTucked, isPeekTuck && !isTucked);
  useEffect(() => saveLastPage(page), [page]);
  const clipboardShortcutToggleAt = useRef(0);
  const applyPreviewState = useCallback((snapshot: PreviewSnapshot) => {
    markMode("preview");
    setMode(snapshot.mode);
    setPage(snapshot.page);
    setIsTucked(snapshot.isTucked);
    setIsPeekTuck(snapshot.retractsAfterPeek);
    setPeekRetractDelayMs(snapshot.peekRetractDelayMs);
  }, [markMode]);

  const setIslandMode = useCallback((nextMode: IslandMode, reason: IslandModeReason = "click") => {
    markMode(reason);
    setMode(nextMode);
    setIsTucked(false);
    setIsPeekTuck(false);
    setTuckedAutomatically(false);
  }, [markMode]);

  // Keeps a peek: a panel opened from a peeking island closes, and the island slides
  // back once the cursor leaves (useTuckPeek).
  const collapseIsland = useCallback((reason: IslandModeReason = "click") => {
    markMode(reason);
    setMode("collapsed");
    setIsTucked(false);
  }, [markMode]);

  const tuckIsland = useCallback(() => {
    setIslandMode("collapsed", "game_mode");
    setIsTucked(true);
  }, [setIslandMode]);

  /** Tucks because a browser came to the front (browser auto-tuck): not an idle tuck, so keep-visible does not undo it. */
  const tuckForBrowser = useCallback(() => {
    setIslandMode("collapsed", "browser");
    setIsTucked(true);
  }, [setIslandMode]);

  const minimizeToEdge = useCallback(() => {
    setIslandMode("collapsed", "minimize_button");
    setIsTucked(true);
    setIsPeekTuck(true);
    setPeekRetractDelayMs(null);
  }, [setIslandMode]);

  /**
   * Tucks after idling. Given a delay, hovering only peeks the island out and it slides
   * back that long after the cursor leaves, like a minimized one; null leaves it out.
   */
  const idleTuck = useCallback((retractDelayMs: number | null) => {
    setIslandMode("collapsed", "idle_timer");
    setIsTucked(true);
    setIsPeekTuck(retractDelayMs !== null);
    setPeekRetractDelayMs(retractDelayMs);
    setTuckedAutomatically(true);
  }, [setIslandMode]);

  const revealIsland = useCallback((reason: IslandModeReason = "click") => {
    markMode(reason);
    setIsTucked(false);
    setIsPeekTuck(false);
    setTuckedAutomatically(false);
  }, [markMode]);

  /**
   * Slides out for a message preview and back once it has gone (useIslandTucking holds the
   * peek while the preview shows), so a line pops into the island and returns to a line.
   */
  const revealForMessage = useCallback(() => {
    markMode("message");
    setIsTucked(false);
    setIsPeekTuck(true);
  }, [markMode]);

  /** Slides out under the cursor; a minimized island slides back when it leaves. */
  const peekIsland = useCallback(() => {
    markMode("hover");
    setIsTucked(false);
  }, [markMode]);

  const endPeek = useCallback(() => {
    markMode("peek_timeout");
    setMode("collapsed");
    setIsTucked(true);
  }, [markMode]);

  /** After opening a page from a peeking island: it still slides back once the cursor leaves. */
  const resumePeek = useCallback(() => {
    markMode("hover");
    setIsPeekTuck(true);
  }, [markMode]);

  const openIslandPage = useCallback((nextPage: IslandPage, reason: IslandModeReason = "click") => {
    if (nextPage === "clipboard" && openDetachedClipboardHistory()) return;
    markMode(reason);
    setPage(nextPage);
    setMode("expanded");
    setIsTucked(false);
    setIsPeekTuck(false);
    setTuckedAutomatically(false);
  }, [markMode]);

  const openClipboardHistory = useCallback(() => {
    openIslandPage("clipboard", "shortcut");
  }, [openIslandPage]);

  const toggleClipboardHistory = useCallback(() => {
    const now = Date.now();

    if (now - clipboardShortcutToggleAt.current < 250) {
      return;
    }

    clipboardShortcutToggleAt.current = now;

    if (openDetachedClipboardHistory()) return;

    if (mode === "expanded" && page === "clipboard") {
      setIslandMode("collapsed", "shortcut");
      return;
    }

    void showClipboardHistoryIsland().catch((error) => console.error("Failed to show clipboard island", error));
    openClipboardHistory();
  }, [mode, openClipboardHistory, page, setIslandMode]);

  return {
    isPreviewing, setIsPreviewing, applyPreviewState,
    mode,
    isTucked,
    isPeeking: isPeekTuck && !isTucked,
    /** Tucked such that hovering only peeks it out (minimized, or idle-tucked with retract). */
    retractsAfterPeek: isPeekTuck,
    peekRetractDelayMs,
    tuckedAutomatically,
    page,
    setPage,
    collapseIsland,
    tuckIsland,
    tuckForBrowser,
    revealIsland,
    revealForMessage,
    minimizeToEdge,
    idleTuck,
    peekIsland,
    endPeek,
    resumePeek,
    openIslandPage,
    toggleClipboardHistory,
  };
}
