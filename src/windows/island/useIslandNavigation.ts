import { useCallback, useEffect, useRef, useState } from "react";
import type { IslandMode, IslandPage } from "./types";
import type { PreviewSnapshot } from "./panelPreviewPlan";
import { openDetachedClipboardHistory } from "../clipboard/api";
import { showClipboardHistoryIsland } from "../../features/clipboard/api";
import { loadLastPage, saveLastPage } from "./lastPage";
import type { IslandModeReason } from "./diagnosticMode";
import { useModeDiagnostics } from "./useModeDiagnostics";
import type { TuckSource } from "./browserTuck";
import { isIslandHeld } from "./islandHold";

/** The reasons that close the island on their own; a hold (islandHold.ts) ignores them. */
const AUTO_CLOSE: ReadonlySet<IslandModeReason> = new Set(["focus_lost", "hover_leave", "idle_timer", "peek_timeout"]);

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
  const [tuckSource, setTuckSource] = useState<TuckSource | null>(null);
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
    setTuckSource(null);
  }, [markMode]);

  // Keeps a peek: a panel opened from a peeking island closes, and the island slides
  // back once the cursor leaves (useTuckPeek).
  const collapseIsland = useCallback((reason: IslandModeReason = "click") => {
    // A hold (Eye Care's break time) outlasts a cursor that leaves or a window that takes the
    // focus; the user closes the island themselves.
    if (AUTO_CLOSE.has(reason) && isIslandHeld()) return;
    markMode(reason);
    setMode("collapsed");
    setIsTucked(false);
  }, [markMode]);

  const tuckIsland = useCallback(() => {
    setIslandMode("collapsed", "click");
    setIsTucked(true);
    setTuckSource("manual");
  }, [setIslandMode]);

  const tuckForGame = useCallback(() => {
    setIslandMode("collapsed", "game_mode");
    setIsTucked(true);
    setTuckSource("game");
  }, [setIslandMode]);

  /** Tucks because a browser came to the front (browser auto-tuck): not an idle tuck, so keep-visible does not undo it. */
  const tuckForBrowser = useCallback(() => {
    setIslandMode("collapsed", "browser");
    setIsTucked(true);
    setTuckSource("browser");
  }, [setIslandMode]);

  const minimizeToEdge = useCallback(() => {
    setIslandMode("collapsed", "minimize_button");
    setIsTucked(true);
    setIsPeekTuck(true);
    setPeekRetractDelayMs(null);
    setTuckSource("manual");
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
    setTuckSource("idle");
  }, [setIslandMode]);

  const revealIsland = useCallback((reason: IslandModeReason = "click") => {
    markMode(reason);
    setIsTucked(false);
    setIsPeekTuck(false);
    setTuckSource(null);
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
    setTuckSource(tuckSource);
  }, [markMode, tuckSource]);

  const openIslandPage = useCallback((nextPage: IslandPage, reason: IslandModeReason = "click") => {
    if (nextPage === "clipboard" && openDetachedClipboardHistory()) return;
    markMode(reason);
    setPage(nextPage);
    setMode("expanded");
    setIsTucked(false);
    setIsPeekTuck(false);
    setTuckSource(null);
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
    tuckSource,
    page,
    setPage,
    collapseIsland,
    tuckIsland,
    tuckForGame,
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
