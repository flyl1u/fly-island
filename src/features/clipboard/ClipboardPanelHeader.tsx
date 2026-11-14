import { ClipboardList, Keyboard, Star, Trash2, X } from "lucide-react";
import { useTranslation } from "../../i18n";
import { normalizeClipboardShortcut } from "./shortcut";
import "./ClipboardPanelHeader.css";

export function ClipboardPanelHeader({
  itemCount,
  favoriteCount,
  shortcutEnabled,
  shortcut,
  selecting, selectedCount, allSelected, deleting, visibleCount,
  onSelectAll, onDelete, onCancel,
}: {
  itemCount: number;
  favoriteCount: number;
  shortcutEnabled: boolean;
  shortcut: string;
  selecting: boolean;
  selectedCount: number;
  allSelected: boolean;
  deleting: boolean;
  visibleCount: number;
  onSelectAll: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const t = useTranslation();

  return (
    <header className="clipboard-panel__header">
      <div className="clipboard-panel__title">
        <ClipboardList size={16} strokeWidth={2.2} />
        <span>{selecting ? t.clipboard.selectEntries : t.clipboard.title}</span>
        <strong>{itemCount}</strong>
        {favoriteCount > 0 && !selecting && (
          <em aria-label={t.clipboard.favoriteCount(favoriteCount)}>
            <Star size={10} strokeWidth={2.4} fill="currentColor" />
            {favoriteCount}
          </em>
        )}
      </div>
      <div className="clipboard-panel__tools">
        {selecting && <button className="clipboard-select-all" type="button" disabled={deleting || visibleCount === 0} onClick={onSelectAll}>
          {allSelected ? t.clipboard.deselectAll : t.clipboard.selectAll}
        </button>}
        {shortcutEnabled && !selecting ? (
          <span
            className="clipboard-shortcut-display"
            aria-label={t.clipboard.expandShortcut}
          >
            <Keyboard size={14} strokeWidth={2.3} />
            <span>{normalizeClipboardShortcut(shortcut)}</span>
          </span>
        ) : null}
        <button
          className={[
            "clipboard-clear-button",
            selecting ? "clipboard-clear-button--confirming" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          type="button"
          disabled={selecting ? selectedCount === 0 || deleting : itemCount === 0}
          aria-label={selecting ? t.clipboard.deleteSelected(selectedCount) : t.clipboard.selectEntries}
          onClick={onDelete}
        >
          <Trash2 size={14} strokeWidth={1.5} absoluteStrokeWidth />
          {selecting && <span>{selectedCount}</span>}
        </button>
        {selecting && <button className="clipboard-clear-button" type="button" disabled={deleting} aria-label={t.clipboard.finishSelection} onClick={onCancel}>
          <X size={14} strokeWidth={1.5} absoluteStrokeWidth />
        </button>}
      </div>
    </header>
  );
}
