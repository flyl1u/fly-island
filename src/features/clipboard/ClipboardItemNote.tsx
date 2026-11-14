import { Check, Pencil, X } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { ClipboardHistoryItem } from "./api";

export function ClipboardItemNote({ item, isEditingNote, noteDraft, isSavingNote, onNoteDraftChange, onSaveNote, onCancelEditNote, onStartEditNote }: {
  item: ClipboardHistoryItem;
  isEditingNote: boolean;
  noteDraft: string;
  isSavingNote: boolean;
  onNoteDraftChange: (value: string) => void;
  onSaveNote: (id: string) => void;
  onCancelEditNote: () => void;
  onStartEditNote: (item: ClipboardHistoryItem) => void;
}) {
  const t = useTranslation();
  return (
      <div className="clipboard-item__note">
        {isEditingNote ? (
          <form
            className="clipboard-note-editor"
            onSubmit={(event) => {
              event.preventDefault();
              onSaveNote(item.id);
            }}
          >
            <input
              autoFocus
              value={noteDraft}
              maxLength={80}
              placeholder={t.clipboard.notePlaceholder}
              aria-label={t.clipboard.noteInputLabel}
              disabled={isSavingNote}
              onChange={(event) => onNoteDraftChange(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  onCancelEditNote();
                }
              }}
            />
            <button
              type="submit"
              aria-label={t.clipboard.saveNote}
              disabled={isSavingNote}
            >
              <Check size={13} strokeWidth={2.6} />
            </button>
            <button
              type="button"
              aria-label={t.clipboard.cancelEditNote}
              disabled={isSavingNote}
              onClick={onCancelEditNote}
            >
              <X size={13} strokeWidth={2.5} />
            </button>
          </form>
        ) : (
          <button
            className={item.note ? "clipboard-note clipboard-note--filled" : "clipboard-note"}
            type="button"
            aria-label={
              item.note ? t.clipboard.editNote(item.note) : t.clipboard.addNoteLabel
            }
            onClick={() => onStartEditNote(item)}
          >
            <Pencil size={12} strokeWidth={2.3} />
            <span>{item.note || t.clipboard.noteFallback}</span>
          </button>
        )}
      </div>
  );
}
