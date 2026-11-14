import { useCallback, useRef, useState } from "react";
import type { IslandMode, IslandPage } from "./types";
import type { PreviewSnapshot } from "./panelPreviewPlan";
import { openDetachedClipboardHistory } from "../clipboard/api";
import { showClipboardHistoryIsland } from "../../features/clipboard/api";

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
  const [page, setPage] = useState<IslandPage>("todo");
  const clipboardShortcutToggleAt = useRef(0);
  const applyPreviewState = useCallback((snapshot: PreviewSnapshot) => {
    setMode(snapshot.mode);
    setPage(snapshot.page);
    setIsTucked(snapshot.isTucked);
    setIsPeekTuck(snapshot.retractsAfterPeek);
    setPeekRetractDelayMs(snapshot.peekRetractDelayMs);
  }, []);

  const setIslandMode = useCallback((nextMode: IslandMode) => {
    setMode(nextMode);
    setIsTucked(false);
    setIsPeekTuck(false);
    setTuckedAutomatically(false);
  }, []);

  // Keeps a peek: a panel opened from a peeking island closes, and the island slides
  // back once the cursor leaves (useTuckPeek).
  const collapseIsland = useCallback(() => {
    setMode("collapsed");
    setIsTucked(false);
  }, []);

  const tuckIsland = useCallback(() => {
    setIslandMode("collapsed");
    setIsTucked(true);
  }, [setIslandMode]);

  const minimizeToEdge = useCallback(() => {
    setIslandMode("collapsed");
    setIsTucked(true);
    setIsPeekTuck(true);
    setPeekRetractDelayMs(null);
  }, [setIslandMode]);

  /**
   * Tucks after idling. Given a delay, hovering only peeks the island out and it slides
   * back that long after the cursor leaves, like a minimized one; null leaves it out.
   */
  const idleTuck = useCallback((retractDelayMs: number | null) => {
    setIslandMode("collapsed");
    setIsTucked(true);
    setIsPeekTuck(retractDelayMs !== null);
    setPeekRetractDelayMs(retractDelayMs);
    setTuckedAutomatically(true);
  }, [setIslandMode]);

  const revealIsland = useCallback(() => {
    setIsTucked(false);
    setIsPeekTuck(false);
    setTuckedAutomatically(false);
  }, []);

  /**
   * Slides out for a message preview and back once it has gone (useIslandTucking holds the
   * peek while the preview shows), so a line pops into the island and returns to a line.
   */
  const revealForMessage = useCallback(() => {
    setIsTucked(false);
    setIsPeekTuck(true);
  }, []);

  /** Slides out under the cursor; a minimized island slides back when it leaves. */
  const peekIsland = useCallback(() => {
    setIsTucked(false);
  }, []);

  const endPeek = useCallback(() => {
    setMode("collapsed");
    setIsTucked(true);
  }, []);

  /** After opening a page from a peeking island: it still slides back once the cursor leaves. */
  const resumePeek = useCallback(() => {
    setIsPeekTuck(true);
  }, []);

  const openIslandPage = useCallback((nextPage: IslandPage) => {
    if (nextPage === "clipboard" && openDetachedClipboardHistory()) return;
    setPage(nextPage);
    setMode("expanded");
    setIsTucked(false);
    setIsPeekTuck(false);
    setTuckedAutomatically(false);
  }, []);

  const openClipboardHistory = useCallback(() => {
    openIslandPage("clipboard");
  }, [openIslandPage]);

  const toggleClipboardHistory = useCallback(() => {
    const now = Date.now();

    if (now - clipboardShortcutToggleAt.current < 250) {
      return;
    }

    clipboardShortcutToggleAt.current = now;

    if (openDetachedClipboardHistory()) return;

    if (mode === "expanded" && page === "clipboard") {
      setIslandMode("collapsed");
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
