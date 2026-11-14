import { useCallback, useEffect, useState } from "react";
import type { ClipboardHistoryItem } from "./api";

/** Only the individual row delete keeps its two-click, three-second confirmation. */
export function useClipboardConfirmations(
  items: ClipboardHistoryItem[],
  onDeleteItem: (id: string) => Promise<void> | void,
) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  useEffect(() => {
    if (!confirmDeleteId) return;
    const timer = window.setTimeout(() => setConfirmDeleteId(null), 3000);
    const dismiss = (event: PointerEvent) => {
      if (!event.composedPath().some((node) => node instanceof Element && node.matches("[data-clipboard-confirm-control='true']"))) {
        setConfirmDeleteId(null);
      }
    };
    document.addEventListener("pointerdown", dismiss, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", dismiss, true);
    };
  }, [confirmDeleteId]);
  const currentId = items.some((item) => item.id === confirmDeleteId) ? confirmDeleteId : null;
  const dismissConfirmations = useCallback(() => setConfirmDeleteId(null), []);
  return {
    confirmDeleteId: currentId,
    dismissConfirmations,
    handleDeleteItem: (id: string) => {
      if (currentId !== id) { setConfirmDeleteId(id); return; }
      setConfirmDeleteId(null);
      void Promise.resolve(onDeleteItem(id));
    },
  };
}
