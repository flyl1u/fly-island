import { useCallback, useEffect, useState } from "react";
import { getClipboardHistory, listenClipboardHistoryChanged, setClipboardHistorySettings, type ClipboardHistorySettings } from "./api";
import { DEFAULT_CLIPBOARD_HISTORY, normalizeClipboardSettings } from "./settings";

/** Clipboard history settings for the settings window, kept in sync with the native store. */
export function useClipboardSettings() {
  const [clipboardSettings, setClipboardSettings] =
    useState<ClipboardHistorySettings>(DEFAULT_CLIPBOARD_HISTORY.settings);

  const refreshClipboardSettings = useCallback(async () => {
    try {
      const snapshot = await getClipboardHistory();
      setClipboardSettings(snapshot.settings);
    } catch (error) {
      console.error("Failed to read clipboard history settings", error);
    }
  }, []);

  useEffect(() => {
    void refreshClipboardSettings();

    let didCancel = false;
    let unlisten: (() => void) | null = null;

    void listenClipboardHistoryChanged(() => {
      void refreshClipboardSettings();
    })
      .then((nextUnlisten) => {
        if (didCancel) {
          nextUnlisten();
        } else {
          unlisten = nextUnlisten;
        }
      })
      .catch((error) => {
        console.error("Failed to listen for clipboard history changes", error);
      });

    return () => {
      didCancel = true;
      unlisten?.();
    };
  }, [refreshClipboardSettings]);

  const updateClipboardSettings = useCallback(
    async (nextSettings: ClipboardHistorySettings) => {
      const normalizedSettings = normalizeClipboardSettings(nextSettings);
      setClipboardSettings(normalizedSettings);

      try {
        const snapshot = await setClipboardHistorySettings(normalizedSettings);
        setClipboardSettings(snapshot.settings);
      } catch (error) {
        console.error("Failed to update clipboard history settings", error);
        void refreshClipboardSettings();
      }
    },
    [refreshClipboardSettings],
  );

  return [clipboardSettings, updateClipboardSettings] as const;
}
