import { useEffect, useRef, useState } from "react";
import { getDefaultTodoSaveDirectory } from "./api";
import { TODO_SAVE_DIRECTORY_CHANGED_EVENT, TODO_SAVE_DIRECTORY_STORAGE_KEY, hasStoredSaveDirectory, loadSaveDirectory, saveSaveDirectory } from "./storage";

/**
 * The markdown save directory. A first run fills in the native default; later
 * changes come from the settings window through storage events.
 */
export function useTodoSaveDirectory(onExternalChange: () => void) {
  const [saveDirectory, setSaveDirectory] = useState(loadSaveDirectory);
  const shouldInitializeDefaultSaveDirectory = useRef(!hasStoredSaveDirectory());
  const defaultSaveDirectoryRequestInFlight = useRef(false);

  useEffect(() => {
    if (
      !shouldInitializeDefaultSaveDirectory.current ||
      saveDirectory.trim() ||
      defaultSaveDirectoryRequestInFlight.current
    ) {
      return;
    }

    let didCancel = false;
    defaultSaveDirectoryRequestInFlight.current = true;

    void getDefaultTodoSaveDirectory()
      .then((defaultDirectory) => {
        if (didCancel) {
          return;
        }

        const nextDirectory = defaultDirectory.trim();

        if (!nextDirectory) {
          return;
        }

        shouldInitializeDefaultSaveDirectory.current = false;
        setSaveDirectory((currentDirectory) =>
          currentDirectory.trim() ? currentDirectory : nextDirectory,
        );
      })
      .catch((error) => {
        console.error("Failed to resolve default todo save path", error);
      })
      .finally(() => {
        if (!didCancel) {
          defaultSaveDirectoryRequestInFlight.current = false;
        }
      });

    return () => {
      didCancel = true;
      defaultSaveDirectoryRequestInFlight.current = false;
    };
  }, [saveDirectory]);

  // The settings window edits this key; storage events deliver its changes here.
  useEffect(() => {
    const reload = () => {
      setSaveDirectory(loadSaveDirectory());
      onExternalChange();
    };
    const syncFromSettingsWindow = (event: StorageEvent) => {
      if (event.key === TODO_SAVE_DIRECTORY_STORAGE_KEY || event.key === null) reload();
    };

    window.addEventListener("storage", syncFromSettingsWindow);
    window.addEventListener(TODO_SAVE_DIRECTORY_CHANGED_EVENT, reload);
    return () => {
      window.removeEventListener("storage", syncFromSettingsWindow);
      window.removeEventListener(TODO_SAVE_DIRECTORY_CHANGED_EVENT, reload);
    };
  }, [onExternalChange]);

  useEffect(() => {
    if (!saveDirectory && shouldInitializeDefaultSaveDirectory.current) {
      return;
    }

    saveSaveDirectory(saveDirectory);
  }, [saveDirectory]);

  return saveDirectory;
}
