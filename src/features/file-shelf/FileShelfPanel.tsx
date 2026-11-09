import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, Inbox } from "lucide-react";
import { useTranslation } from "../../i18n";
import { FileShelfHeader } from "./FileShelfHeader";
import { FileShelfItemRow } from "./FileShelfItemRow";
import { EMPTY_SELECTION, filterShelfItems, keepVisible, selectEntry, targetIds } from "./selection";
import type { FileShelfController } from "./useFileShelf";
import "./FileShelfPanel.css";

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
  const [query, setQuery] = useState("");
  const [rawSelection, setSelection] = useState(EMPTY_SELECTION);
  const listRef = useRef<HTMLDivElement>(null);
  const { items, error, recentDrop, refresh } = shelf;
  const recentIds = new Set(recentDrop?.ids ?? []);
  const visible = useMemo(() => filterShelfItems(items, query), [items, query]);
  const visibleIds = useMemo(() => visible.map((item) => item.id), [visible]);
  // Entries that left the list (removed, cleaned up, filtered out) leave the selection.
  const selection = keepVisible(rawSelection, visibleIds);
  const selected = new Set(selection.ids);

  // Files may have moved since the page was last open.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Dropped files land on top; clear the search and bring them into view.
  useEffect(() => {
    if (!recentDrop) return;
    setQuery("");
    listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [recentDrop]);

  return (
    <section className={`shelf-panel${isDropTarget ? " shelf-panel--dropping" : ""}`} aria-label={t.fileShelf.title}>
      <FileShelfHeader
        count={items.length}
        noticeKey={recentDrop?.allExisting ? recentDrop.key : null}
        query={query}
        selectedCount={selection.ids.length}
        onQueryChange={setQuery}
        onClear={() => void shelf.clear()}
        onCopySelected={() => void shelf.copy(selection.ids)}
        onRemoveSelected={() => void shelf.remove(selection.ids)}
        onClearSelection={() => setSelection(EMPTY_SELECTION)}
      />
      {error && <p className="shelf-panel__error" role="alert">{error}</p>}
      {items.length === 0 ? (
        <div className="shelf-empty">
          {isDropTarget ? <ArrowDownToLine className="shelf-empty__icon" size={24} strokeWidth={2} /> : <Inbox className="shelf-empty__icon" size={24} strokeWidth={1.8} />}
          <span className="shelf-empty__title">{isDropTarget ? t.fileShelf.dropHint : t.fileShelf.empty}</span>
          {!isDropTarget && <span className="shelf-empty__note">{t.fileShelf.emptyNote}</span>}
        </div>
      ) : visible.length === 0 ? (
        <div className="shelf-empty">{t.fileShelf.emptySearch}</div>
      ) : (
        <div
          ref={listRef}
          className="shelf-list"
          role="list"
          aria-multiselectable="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelection(EMPTY_SELECTION);
          }}
        >
          {visible.map((item) => (
            <FileShelfItemRow
              key={item.id}
              item={item}
              isRecent={recentIds.has(item.id)}
              isSelected={selected.has(item.id)}
              onSelect={(id, mode) => setSelection((current) => selectEntry(keepVisible(current, visibleIds), visibleIds, id, mode))}
              onDragOut={(id) => void shelf.startDrag(targetIds(selection, id))}
              onOpen={(id) => void (revealOnDoubleClick ? shelf.reveal(id) : shelf.open(id))}
              onCopy={(id) => shelf.copy([id])}
              onReveal={(id) => void shelf.reveal(id)}
              onTogglePin={(id) => void shelf.togglePin(id)}
              onRemove={(id) => void shelf.remove([id])}
            />
          ))}
        </div>
      )}
      {isDropTarget && items.length > 0 && (
        <div className="shelf-drop-overlay" aria-hidden="true">
          <span className="shelf-drop-overlay__icon">
            <ArrowDownToLine size={22} strokeWidth={2.2} />
          </span>
          <span>{t.fileShelf.dropHint}</span>
        </div>
      )}
    </section>
  );
}
