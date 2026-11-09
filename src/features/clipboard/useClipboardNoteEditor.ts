import { useCallback, useEffect, useRef, useState } from "react";
import type { ClipboardHistoryItem } from "./api";

export function useClipboardNoteEditor(
  items: ClipboardHistoryItem[],
  onCopyItem: (id: string) => Promise<boolean> | boolean,
  onToggleFavorite: (id: string) => Promise<void> | void,
  onUpdateNote: (id: string, note: string) => Promise<boolean> | boolean,
  dismissConfirmations: () => void,
) {
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const copiedResetRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copiedResetRef.current !== null) {
        window.clearTimeout(copiedResetRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (editingNoteId && !items.some((item) => item.id === editingNoteId)) {
      setEditingNoteId(null);
      setNoteDraft("");
      setIsSavingNote(false);
    }
  }, [editingNoteId, items]);

  const showCopiedState = useCallback((id: string) => {
    setCopiedItemId(id);

    if (copiedResetRef.current !== null) {
      window.clearTimeout(copiedResetRef.current);
    }

    copiedResetRef.current = window.setTimeout(() => {
      setCopiedItemId(null);
      copiedResetRef.current = null;
    }, 1100);
  }, []);

  const handleCopyItem = useCallback(
    (id: string) => {
      void Promise.resolve(onCopyItem(id)).then((didCopy) => {
        if (didCopy) {
          showCopiedState(id);
        }
      });
    },
    [onCopyItem, showCopiedState],
  );

  const handleToggleFavorite = useCallback(
    (id: string) => {
      dismissConfirmations();
      void Promise.resolve(onToggleFavorite(id));
    },
    [dismissConfirmations, onToggleFavorite],
  );

  const startEditingNote = useCallback(
    (item: ClipboardHistoryItem) => {
      dismissConfirmations();
      setEditingNoteId(item.id);
      setNoteDraft(item.note ?? "");
    },
    [dismissConfirmations],
  );

  const cancelEditingNote = useCallback(() => {
    if (isSavingNote) {
      return;
    }

    setEditingNoteId(null);
    setNoteDraft("");
  }, [isSavingNote]);

  const saveNote = useCallback(
    (id: string) => {
      if (isSavingNote) {
        return;
      }

      setIsSavingNote(true);
      void Promise.resolve(onUpdateNote(id, noteDraft)).then((didSave) => {
        setIsSavingNote(false);
        if (didSave) {
          setEditingNoteId(null);
          setNoteDraft("");
        }
      });
    },
    [isSavingNote, noteDraft, onUpdateNote],
  );

  return {
    copiedItemId,
    editingNoteId,
    noteDraft,
    setNoteDraft,
    isSavingNote,
    handleCopyItem,
    handleToggleFavorite,
    startEditingNote,
    cancelEditingNote,
    saveNote,
  };
}
