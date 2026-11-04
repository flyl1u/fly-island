import { useEffect } from "react";
import { matchesClipboardShortcut } from "../../features/clipboard/shortcut";
import { pageCycleDirection, pageDigitFromEvent } from "../../features/appearance/pageShortcuts";
import { cycleShortcutPage, pageForAltDigit, type IslandFeatures } from "./features";
import type { IslandMode, IslandPage } from "./types";

/** In-window keys: the clipboard history shortcut toggles its page, Escape collapses the island. */
export function useIslandKeyboard(
  clipboardShortcutEnabled: boolean,
  clipboardShortcut: string,
  onToggleClipboardHistory: () => void,
  onCollapse: () => void,
  mode: IslandMode,
  features: IslandFeatures,
  page: IslandPage,
  onPageChange: (page: IslandPage) => void,
  pageDigitModifiers: string,
  pageNextShortcut: string,
  pagePreviousShortcut: string,
) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        clipboardShortcutEnabled &&
        matchesClipboardShortcut(event, clipboardShortcut)
      ) {
        event.preventDefault();
        onToggleClipboardHistory();
        return;
      }

      // Only while this window is focused and expanded. A collapsed or tucked island
      // stays put, and holding the key does not repeat the switch.
      const digit = pageDigitFromEvent(event, pageDigitModifiers);
      if (digit !== null && mode === "expanded") {
        const target = pageForAltDigit(features, digit);
        if (target) {
          event.preventDefault();
          if (target !== page) onPageChange(target);
        }
        return;
      }

      const direction = pageCycleDirection(event, pageNextShortcut, pagePreviousShortcut);
      if (direction !== null && mode === "expanded") {
        event.preventDefault();
        const target = cycleShortcutPage(features, page, direction);
        if (target) onPageChange(target);
        return;
      }

      if (event.key === "Escape") {
        onCollapse();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    clipboardShortcut,
    clipboardShortcutEnabled,
    features,
    mode,
    onCollapse,
    onPageChange,
    onToggleClipboardHistory,
    page,
    pageDigitModifiers,
    pageNextShortcut,
    pagePreviousShortcut,
  ]);
}
