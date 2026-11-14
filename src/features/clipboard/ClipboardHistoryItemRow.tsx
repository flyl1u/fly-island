import { Check, ClipboardList, Copy, ImageIcon, Star, Trash2 } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { ClipboardHistoryItem } from "./api";
import { ClipboardItemNote } from "./ClipboardItemNote";
import "./ClipboardHistoryItemRow.css";

export function ClipboardHistoryItemRow({
  item,
  elementRef,
  isEditingNote,
  noteDraft,
  isSavingNote,
  isConfirmingDelete,
  isCopied,
  onCopy,
  onToggleFavorite,
  onStartEditNote,
  onNoteDraftChange,
  onSaveNote,
  onCancelEditNote,
  onDelete,
  selecting,
  selected,
  onSelect,
  onPreview,
}: {
  item: ClipboardHistoryItem;
  elementRef: (node: HTMLElement | null) => void;
  isEditingNote: boolean;
  noteDraft: string;
  isSavingNote: boolean;
  isConfirmingDelete: boolean;
  isCopied: boolean;
  onCopy: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onStartEditNote: (item: ClipboardHistoryItem) => void;
  onNoteDraftChange: (value: string) => void;
  onSaveNote: (id: string) => void;
  onCancelEditNote: () => void;
  onDelete: (id: string) => void;
  selecting: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  onPreview: (item: ClipboardHistoryItem) => void;
}) {
  const t = useTranslation();

  return (
    <article className={`clipboard-item${selecting ? " clipboard-item--selecting" : ""}${selected ? " clipboard-item--selected" : ""}`}
      role="listitem" ref={elementRef} data-clipboard-id={item.id} onClick={() => { if (selecting) onSelect(item.id); }}>
      <button className="clipboard-item__select" type="button" role="checkbox" aria-checked={selected}
        aria-label={t.clipboard.selectItem(item.preview)} tabIndex={selecting ? 0 : -1} aria-hidden={!selecting}
        onClick={(event) => { event.stopPropagation(); onSelect(item.id); }}>
        {selected && <Check size={14} strokeWidth={1.5} absoluteStrokeWidth />}
      </button>
      <div className="clipboard-item__content">
        {item.kind === "image" ? (
          <button className="clipboard-item__thumb" type="button" aria-label={t.clipboard.imagePreview}
            onClick={(event) => { event.stopPropagation(); onPreview(item); }}>
            {item.image?.thumbnailDataUrl ? (
              <img src={item.image.thumbnailDataUrl} alt="" />
            ) : (
              <ImageIcon size={15} strokeWidth={2} />
            )}
          </button>
        ) : (
          <span className="clipboard-item__text-icon">
            <ClipboardList size={14} strokeWidth={2} />
          </span>
        )}
        <button className="clipboard-item__main" type="button" onClick={(event) => {
          event.stopPropagation();
          if (selecting) onSelect(item.id); else onCopy(item.id);
        }}>
          <span className="clipboard-item__preview">{item.preview}</span>
        </button>
      </div>
      {!selecting && <ClipboardItemNote item={item} isEditingNote={isEditingNote} noteDraft={noteDraft} isSavingNote={isSavingNote}
        onNoteDraftChange={onNoteDraftChange} onSaveNote={onSaveNote} onCancelEditNote={onCancelEditNote} onStartEditNote={onStartEditNote} />}
      <div className="clipboard-item__actions" hidden={selecting}>
        <button
          className={[
            "clipboard-favorite-button",
            item.favorite ? "clipboard-favorite-button--active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          type="button"
          aria-label={
            item.favorite
              ? t.clipboard.unfavoriteItem
              : t.clipboard.favoriteItem
          }
          aria-pressed={item.favorite}
          onClick={() => onToggleFavorite(item.id)}
        >
          <Star
            size={14}
            strokeWidth={2.3}
            fill={item.favorite ? "currentColor" : "none"}
          />
        </button>
        <button
          className={[
            "clipboard-delete-button",
            isConfirmingDelete ? "clipboard-delete-button--confirming" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          type="button"
          aria-label={t.clipboard.deleteItem}
          onClick={() => onDelete(item.id)}
          data-clipboard-confirm-control="true"
        >
          {isConfirmingDelete ? (
            <Check className="save-check-icon" size={14} strokeWidth={2.7} />
          ) : (
            <Trash2 size={14} strokeWidth={2.3} />
          )}
        </button>
        <button
          className={[
            "clipboard-copy-button",
            isCopied ? "clipboard-copy-button--copied" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          type="button"
          aria-label={t.clipboard.copyBack}
          onClick={() => onCopy(item.id)}
        >
          {isCopied ? (
            <Check className="save-check-icon" size={14} strokeWidth={2.7} />
          ) : (
            <Copy size={14} strokeWidth={2.3} />
          )}
        </button>
      </div>
    </article>
  );
}
