import { useEffect, useRef } from "react";
import { listenTranslationIslandShortcut } from "./api";

/** Calls `onShortcut` when the translation shortcut is pressed while translation opens on the island. */
export function useTranslationIslandShortcut(enabled: boolean, onShortcut: () => void) {
  const latest = useRef(onShortcut);
  latest.current = onShortcut;

  useEffect(() => {
    if (!enabled) return;
    let didCancel = false;
    let unlisten: (() => void) | null = null;
    void listenTranslationIslandShortcut(() => latest.current())
      .then((nextUnlisten) => {
        if (didCancel) nextUnlisten();
        else unlisten = nextUnlisten;
      })
      .catch((error) => console.error("Failed to listen for the translation shortcut", error));
    return () => { didCancel = true; unlisten?.(); };
  }, [enabled]);
}
