import { useCallback, useRef, useState } from "react";
import type { IslandMode, IslandPage } from "./types";

/** Collapsed / expanded / tucked mode and the open page of the island. */
export function useIslandNavigation() {
  const [mode, setMode] = useState<IslandMode>("collapsed");
  const [isTucked, setIsTucked] = useState(false);
  // Tucked by the minimize button: hovering only peeks the island out, and it slides
  // back once the cursor leaves. A click (or anything else that reveals it) ends this.
  const [isPeekTuck, setIsPeekTuck] = useState(false);
  // How long a peeking island waits after the cursor leaves; null keeps the minimize default.
  const [peekRetractDelayMs, setPeekRetractDelayMs] = useState<number | null>(null);
  const [page, setPage] = useState<IslandPage>("todo");
  const clipboardShortcutToggleAt = useRef(0);

  const setIslandMode = useCallback((nextMode: IslandMode) => {
    setMode(nextMode);
    setIsTucked(false);
    setIsPeekTuck(false);
  }, []);

  const collapseIsland = useCallback(() => {
    setIslandMode("collapsed");
  }, [setIslandMode]);

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
  }, [setIslandMode]);

  const revealIsland = useCallback(() => {
    setIsTucked(false);
    setIsPeekTuck(false);
  }, []);

  /** Slides out under the cursor; a minimized island slides back when it leaves. */
  const peekIsland = useCallback(() => {
    setIsTucked(false);
  }, []);

  const endPeek = useCallback(() => {
    setIsTucked(true);
  }, []);

  const openIslandPage = useCallback((nextPage: IslandPage) => {
    setPage(nextPage);
    setMode("expanded");
    setIsTucked(false);
    setIsPeekTuck(false);
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

    if (mode === "expanded" && page === "clipboard") {
      setIslandMode("collapsed");
      return;
    }

    openClipboardHistory();
  }, [mode, openClipboardHistory, page, setIslandMode]);

  return {
    mode,
    isTucked,
    isPeeking: isPeekTuck && !isTucked,
    peekRetractDelayMs,
    page,
    setPage,
    collapseIsland,
    tuckIsland,
    revealIsland,
    minimizeToEdge,
    idleTuck,
    peekIsland,
    endPeek,
    openIslandPage,
    toggleClipboardHistory,
  };
}
