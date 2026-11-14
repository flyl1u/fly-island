import { useCallback, useEffect, useState } from "react";
import { deleteClipboardItems, copyClipboardItem, deleteClipboardItem, getClipboardHistory, listenClipboardHistoryChanged, listenClipboardHistoryShortcut, setClipboardItemNote, toggleClipboardFavorite, type ClipboardHistorySnapshot } from "./api";
import { DEFAULT_CLIPBOARD_HISTORY } from "./settings";

/** Clipboard history snapshot, its item actions, and the native change and shortcut listeners. */
export function useClipboardHistory(onShortcut: () => void) {
  const [clipboardHistory, setClipboardHistory] =
    useState<ClipboardHistorySnapshot>(DEFAULT_CLIPBOARD_HISTORY);

  const refreshClipboardHistory = useCallback(async () => {
    try {
      const snapshot = await getClipboardHistory();
      setClipboardHistory(snapshot);
    } catch (error) {
      console.error("Failed to read clipboard history", error);
    }
  }, []);

  const copyClipboardHistoryItem = useCallback(async (id: string) => {
    try {
      const snapshot = await copyClipboardItem(id);
      setClipboardHistory(snapshot);
      return true;
    } catch (error) {
      console.error("Failed to copy clipboard history item", error);
      return false;
    }
  }, []);

  const toggleClipboardHistoryFavorite = useCallback(async (id: string) => {
    try {
      const snapshot = await toggleClipboardFavorite(id);
      setClipboardHistory(snapshot);
    } catch (error) {
      console.error("Failed to toggle clipboard history favorite", error);
    }
  }, []);

  const updateClipboardHistoryItemNote = useCallback(
    async (id: string, note: string) => {
      try {
        const snapshot = await setClipboardItemNote(id, note);
        setClipboardHistory(snapshot);
        return true;
      } catch (error) {
        console.error("Failed to update clipboard history item note", error);
        return false;
      }
    },
    [],
  );

  const deleteClipboardHistoryItem = useCallback(async (id: string) => {
    try {
      const snapshot = await deleteClipboardItem(id);
      setClipboardHistory(snapshot);
    } catch (error) {
      console.error("Failed to delete clipboard history item", error);
    }
  }, []);

  const deleteClipboardHistoryItems = useCallback(async (ids: string[]) => {
    try {
      const snapshot = await deleteClipboardItems(ids);
      setClipboardHistory(snapshot);
      return true;
    } catch (error) {
      console.error("Failed to delete clipboard history items", error);
      return false;
    }
  }, []);

  useEffect(() => {
    void refreshClipboardHistory();

    let didCancel = false;
    let unlistenChanges: (() => void) | null = null;
    let unlistenShortcut: (() => void) | null = null;

    void listenClipboardHistoryChanged(() => {
      void refreshClipboardHistory();
    })
      .then((nextUnlisten) => {
        if (didCancel) {
          nextUnlisten();
        } else {
          unlistenChanges = nextUnlisten;
        }
      })
      .catch((error) => {
        console.error("Failed to listen for clipboard history changes", error);
      });

    void listenClipboardHistoryShortcut(() => {
      if (clipboardHistory.settings.shortcutEnabled) {
        onShortcut();
      }
    })
      .then((nextUnlisten) => {
        if (didCancel) {
          nextUnlisten();
        } else {
          unlistenShortcut = nextUnlisten;
        }
      })
      .catch((error) => {
        console.error("Failed to listen for clipboard history shortcut", error);
      });

    return () => {
      didCancel = true;
      unlistenChanges?.();
      unlistenShortcut?.();
    };
  }, [
    clipboardHistory.settings.shortcutEnabled,
    refreshClipboardHistory,
    onShortcut,
  ]);

  return {
    clipboardHistory,
    copyClipboardHistoryItem,
    toggleClipboardHistoryFavorite,
    updateClipboardHistoryItemNote,
    deleteClipboardHistoryItem,
    deleteClipboardHistoryItems,
  };
}
