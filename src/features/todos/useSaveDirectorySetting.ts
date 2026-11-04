import { useCallback, useEffect, useState } from "react";
import { TODO_SAVE_DIRECTORY_STORAGE_KEY, loadSaveDirectory, saveSaveDirectory } from "./storage";
import type { SavePathState } from "./types";

/** The save directory field in the settings window: an editable draft saved on demand. */
export function useSaveDirectorySetting() {
  const [saveDirectoryDraft, setSaveDirectoryDraft] =
    useState(loadSaveDirectory);
  const [savePathState, setSavePathState] = useState<SavePathState>("idle");
  const [highlightSavePath, setHighlightSavePath] = useState(false);

  useEffect(() => {
    const syncFromIsland = (event: StorageEvent) => {
      if (event.key === TODO_SAVE_DIRECTORY_STORAGE_KEY) {
        setSaveDirectoryDraft(loadSaveDirectory());
      }
    };

    window.addEventListener("storage", syncFromIsland);
    return () => window.removeEventListener("storage", syncFromIsland);
  }, []);

  const saveDirectory = useCallback(() => {
    const nextDirectory = saveDirectoryDraft.trim();

    // Storage unavailable: keep the draft and do not report "saved".
    if (!saveSaveDirectory(nextDirectory)) return;
    setSaveDirectoryDraft(nextDirectory);
    setHighlightSavePath(false);
    setSavePathState("saved");
    window.setTimeout(() => setSavePathState("idle"), 1200);
  }, [saveDirectoryDraft]);

  const highlight = useCallback(() => setHighlightSavePath(true), []);

  return {
    saveDirectoryDraft,
    savePathState,
    highlightSavePath,
    highlight,
    onSaveDirectoryDraftChange: setSaveDirectoryDraft,
    onSaveDirectory: saveDirectory,
  };
}
