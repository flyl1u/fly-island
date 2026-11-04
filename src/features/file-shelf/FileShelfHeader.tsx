import { useEffect, useState } from "react";
import { Check, Copy, Inbox, Search, Trash2, X } from "lucide-react";
import { useTranslation } from "../../i18n";
import "./FileShelfHeader.css";

// A first click on Clear arms it; it disarms again if not confirmed in time.
const CLEAR_CONFIRM_MS = 3_000;

/** Title, count, search and Clear, plus the bar acting on a multi-entry selection. */
export function FileShelfHeader({
  count,
  noticeKey,
  query,
  selectedCount,
  onQueryChange,
  onClear,
  onCopySelected,
  onRemoveSelected,
  onClearSelection,
}: {
  count: number;
  /** Changes each time a drop added only files already on the shelf; null hides the notice. */
  noticeKey: number | null;
  query: string;
  selectedCount: number;
  onQueryChange: (query: string) => void;
  onClear: () => void;
  onCopySelected: () => void;
  onRemoveSelected: () => void;
  onClearSelection: () => void;
}) {
  const t = useTranslation();
  const [confirmingClear, setConfirmingClear] = useState(false);

  useEffect(() => {
    if (!confirmingClear) return;
    const timer = window.setTimeout(() => setConfirmingClear(false), CLEAR_CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [confirmingClear]);

  return (
    <>
      <header className="shelf-panel__header">
        <div className="shelf-panel__title">
          <Inbox size={16} strokeWidth={2.2} />
          <span>{t.fileShelf.title}</span>
          <strong>{count}</strong>
          {noticeKey !== null && (
            <em key={noticeKey} className="shelf-panel__notice" role="status">
              {t.fileShelf.alreadyOnShelf}
            </em>
          )}
        </div>
        {(count > 0 || query) && (
          <label className="shelf-search">
            <Search size={13} strokeWidth={2.3} aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder={t.fileShelf.searchPlaceholder}
              aria-label={t.fileShelf.searchLabel}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query) {
                  event.stopPropagation();
                  onQueryChange("");
                }
              }}
            />
            {query && (
              <button type="button" title={t.fileShelf.clearSearch} aria-label={t.fileShelf.clearSearch} onClick={() => onQueryChange("")}>
                <X size={12} strokeWidth={2.4} />
              </button>
            )}
          </label>
        )}
        <button
          className={`shelf-clear-button${confirmingClear ? " shelf-clear-button--confirming" : ""}`}
          type="button"
          disabled={count === 0}
          title={confirmingClear ? t.fileShelf.confirmClear : t.fileShelf.clear}
          aria-label={confirmingClear ? t.fileShelf.confirmClear : t.fileShelf.clear}
          onClick={() => {
            if (confirmingClear) {
              setConfirmingClear(false);
              onClear();
            } else {
              setConfirmingClear(true);
            }
          }}
        >
          {confirmingClear ? <Check size={14} strokeWidth={2.7} /> : <Trash2 size={14} strokeWidth={2.2} />}
        </button>
      </header>
      {selectedCount > 1 && (
        <div className="shelf-selection-bar" role="toolbar" aria-label={t.fileShelf.selectedCount(selectedCount)}>
          <span>{t.fileShelf.selectedCount(selectedCount)}</span>
          <button type="button" title={t.fileShelf.copySelected} aria-label={t.fileShelf.copySelected} onClick={onCopySelected}>
            <Copy size={13} strokeWidth={2.2} />
          </button>
          <button type="button" title={t.fileShelf.removeSelected} aria-label={t.fileShelf.removeSelected} onClick={onRemoveSelected}>
            <Trash2 size={13} strokeWidth={2.2} />
          </button>
          <button type="button" title={t.fileShelf.clearSelection} aria-label={t.fileShelf.clearSelection} onClick={onClearSelection}>
            <X size={13} strokeWidth={2.4} />
          </button>
        </div>
      )}
    </>
  );
}
