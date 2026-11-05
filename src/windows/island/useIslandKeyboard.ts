import { useEffect } from "react";
import { matchesClipboardShortcut } from "../../features/clipboard/shortcut";

/** In-window keys: the clipboard history shortcut toggles its page, Escape collapses the island. */
export function useIslandKeyboard(
  clipboardShortcutEnabled: boolean,
  clipboardShortcut: string,
  onToggleClipboardHistory: () => void,
  onCollapse: () => void,
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

      if (event.key === "Escape") {
        onCollapse();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    clipboardShortcut,
    clipboardShortcutEnabled,
    onCollapse,
    onToggleClipboardHistory,
  ]);
}
