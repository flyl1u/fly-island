import { useEffect, useState } from "react";
import { Check, Copy, Search, Trash2, X } from "lucide-react";
import { useTranslation } from "../../i18n";
import "./FileShelfBar.css";

// A first click on Clear arms it; it disarms again if not confirmed in time.
const CLEAR_CONFIRM_MS = 3_000;
const STROKE = { strokeWidth: 1.5, absoluteStrokeWidth: true } as const;

/**
 * The line under the files: search once there are many, a short notice now and then,
 * and Clear. The page has no title row: the dot in the island's header already says which page
 * this is. With two or more files chosen the line becomes the bar acting on them, so the page
 * keeps its height. Under one row of tiles there is no line of its own (用户要求 2026-11-19：
 * 底部不要空出来): Clear floats in the panel's corner, beside the tiles' quiet bottom edge.
 */
export function FileShelfBar({
  floating,
  showSearch,
  noticeKey,
  query,
  selectedCount,
  onQueryChange,
  onClear,
  onCopySelected,
  onRemoveSelected,
  onClearSelection,
}: {
  /** One row of tiles: no line under them, the bar floats over the panel's bottom edge. */
  floating: boolean;
  showSearch: boolean;
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

  if (selectedCount > 1) {
    return (
      <div className={`shelf-selection-bar${floating ? " shelf-selection-bar--floating" : ""}`} role="toolbar" aria-label={t.fileShelf.selectedCount(selectedCount)}>
        <span>{t.fileShelf.selectedCount(selectedCount)}</span>
        <button type="button" aria-label={t.fileShelf.copySelected} onClick={onCopySelected}>
          <Copy size={14} {...STROKE} />
        </button>
        <button type="button" aria-label={t.fileShelf.removeSelected} onClick={onRemoveSelected}>
          <Trash2 size={14} {...STROKE} />
        </button>
        <button type="button" aria-label={t.fileShelf.clearSelection} onClick={onClearSelection}>
          <X size={14} {...STROKE} />
        </button>
      </div>
    );
  }

  return (
    <div className={`shelf-bar${floating ? " shelf-bar--floating" : ""}`}>
      {showSearch && (
        <label className="shelf-search">
          <Search size={14} {...STROKE} aria-hidden="true" />
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
            <button type="button" aria-label={t.fileShelf.clearSearch} onClick={() => onQueryChange("")}>
              <X size={12} {...STROKE} />
            </button>
          )}
        </label>
      )}
      {/* Holds the place between search and Clear; a notice shows here for a moment. */}
      <span className="shelf-bar__message">
        {noticeKey !== null && (
          <em key={noticeKey} className="shelf-bar__notice" role="status">
            {t.fileShelf.alreadyOnShelf}
          </em>
        )}
      </span>
      <button
        className={`shelf-clear-button${confirmingClear ? " shelf-clear-button--confirming" : ""}`}
        type="button"
        aria-label={confirmingClear ? t.fileShelf.confirmClear : t.fileShelf.clear}
        title={confirmingClear ? t.fileShelf.confirmClear : undefined}
        onClick={() => {
          if (confirmingClear) {
            setConfirmingClear(false);
            onClear();
          } else {
            setConfirmingClear(true);
          }
        }}
      >
        {confirmingClear ? <Check size={14} {...STROKE} /> : <Trash2 size={14} {...STROKE} />}
      </button>
    </div>
  );
}
