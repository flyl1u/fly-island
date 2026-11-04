import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Check, Inbox, Trash2 } from "lucide-react";
import { useTranslation } from "../../i18n";
import { FileShelfItemRow } from "./FileShelfItemRow";
import type { FileShelfController } from "./useFileShelf";
import "./FileShelfPanel.css";

// A first click on Clear arms it; it disarms again if not confirmed in time.
const CLEAR_CONFIRM_MS = 3_000;

export function FileShelfPanel({
  shelf,
  isDropTarget,
  revealOnDoubleClick,
}: {
  shelf: FileShelfController;
  /** Files are being dragged over the island. */
  isDropTarget: boolean;
  /** Double-clicking (or Enter on) an entry shows it in its folder instead of opening it. */
  revealOnDoubleClick: boolean;
}) {
  const t = useTranslation();
  const [confirmingClear, setConfirmingClear] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const { items, error, recentDrop, refresh } = shelf;
  const recentIds = new Set(recentDrop?.ids ?? []);

  // Files may have moved since the page was last open.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!confirmingClear) return;
    const timer = window.setTimeout(() => setConfirmingClear(false), CLEAR_CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [confirmingClear]);

  // Dropped files land on top; bring them into view.
  useEffect(() => {
    if (recentDrop) listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [recentDrop]);

  return (
    <section className={`shelf-panel${isDropTarget ? " shelf-panel--dropping" : ""}`} aria-label={t.fileShelf.title}>
      <header className="shelf-panel__header">
        <div className="shelf-panel__title">
          <Inbox size={16} strokeWidth={2.2} />
          <span>{t.fileShelf.title}</span>
          <strong>{items.length}</strong>
          {recentDrop?.allExisting && (
            <em key={recentDrop.key} className="shelf-panel__notice" role="status">
              {t.fileShelf.alreadyOnShelf}
            </em>
          )}
        </div>
        <button
          className={`shelf-clear-button${confirmingClear ? " shelf-clear-button--confirming" : ""}`}
          type="button"
          disabled={items.length === 0}
          title={confirmingClear ? t.fileShelf.confirmClear : t.fileShelf.clear}
          aria-label={confirmingClear ? t.fileShelf.confirmClear : t.fileShelf.clear}
          onClick={() => {
            if (confirmingClear) {
              setConfirmingClear(false);
              void shelf.clear();
            } else {
              setConfirmingClear(true);
            }
          }}
        >
          {confirmingClear ? <Check size={14} strokeWidth={2.7} /> : <Trash2 size={14} strokeWidth={2.2} />}
        </button>
      </header>
      {error && <p className="shelf-panel__error" role="alert">{error}</p>}
      {items.length === 0 ? (
        <div className="shelf-empty">{isDropTarget ? t.fileShelf.dropHint : t.fileShelf.empty}</div>
      ) : (
        <div ref={listRef} className="shelf-list" role="list">
          {items.map((item) => (
            <FileShelfItemRow
              key={item.id}
              item={item}
              isRecent={recentIds.has(item.id)}
              dragHint={revealOnDoubleClick ? t.fileShelf.dragHintReveal : t.fileShelf.dragHint}
              onDragOut={(id) => void shelf.startDrag(id)}
              onOpen={(id) => void (revealOnDoubleClick ? shelf.reveal(id) : shelf.open(id))}
              onCopy={shelf.copy}
              onReveal={(id) => void shelf.reveal(id)}
              onRemove={(id) => void shelf.remove(id)}
            />
          ))}
        </div>
      )}
      {isDropTarget && items.length > 0 && (
        <div className="shelf-drop-overlay" aria-hidden="true">
          <ArrowDownToLine size={22} strokeWidth={2.2} />
          <span>{t.fileShelf.dropHint}</span>
        </div>
      )}
    </section>
  );
}
