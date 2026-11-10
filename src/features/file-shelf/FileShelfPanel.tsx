import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, Plus } from "lucide-react";
import { useTranslation } from "../../i18n";
import { FileShelfEmpty } from "./FileShelfEmpty";
import { FileShelfHeader } from "./FileShelfHeader";
import { FileShelfItem } from "./FileShelfItem";
import { getShelfLayout, SHELF_TILE_LIMIT } from "./fileShelf";
import { EMPTY_SELECTION, filterShelfItems, keepVisible, selectEntry, targetIds } from "./selection";
import type { FileShelfController } from "./useFileShelf";
import "./FileShelfPanel.css";

// How long a removed entry fades before it leaves the list (FileShelfItem.css, shelf-item-leave).
const LEAVE_MS = 180;

function prefersReducedMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The file shelf page. A few files sit as large tiles in one row, with an open slot inviting
 * more; past four they become two columns of compact rows. Dragging files over the island
 * turns the page into one drop zone.
 */
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
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const { items, error, recentDrop, refresh } = shelf;
  const recentIds = new Set(recentDrop?.ids ?? []);
  const visible = useMemo(() => filterShelfItems(items, query), [items, query]);
  const visibleIds = useMemo(() => visible.map((item) => item.id), [visible]);
  // Entries that left the list (removed, cleaned up, filtered out) leave the selection.
  const selection = keepVisible(rawSelection, visibleIds);
  const selected = new Set(selection.ids);
  // The layout follows the whole shelf, not the search, so typing does not reshuffle it.
  const layout = getShelfLayout(items.length);

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

  const removeOne = (id: string) => {
    if (prefersReducedMotion()) {
      void shelf.remove([id]);
      return;
    }
    setLeaving((current) => new Set(current).add(id));
    window.setTimeout(() => {
      void shelf.remove([id]).finally(() => setLeaving((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      }));
    }, LEAVE_MS);
  };

  const className = ["shelf-panel", `shelf-panel--${layout}`, isDropTarget ? "shelf-panel--dropping" : ""].filter(Boolean).join(" ");

  return (
    <section className={className} aria-label={t.fileShelf.title}>
      <FileShelfHeader
        count={items.length}
        showSearch={layout === "rows" || query !== ""}
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
      {layout === "empty" ? (
        <FileShelfEmpty isDropTarget={isDropTarget} />
      ) : visible.length === 0 ? (
        <div className="shelf-panel__no-match">{t.fileShelf.emptySearch}</div>
      ) : (
        <div
          ref={listRef}
          className={`shelf-list shelf-list--${layout}`}
          role="list"
          aria-multiselectable="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelection(EMPTY_SELECTION);
          }}
        >
          {visible.map((item) => (
            <FileShelfItem
              key={item.id}
              item={item}
              variant={layout === "tiles" ? "tile" : "row"}
              isRecent={recentIds.has(item.id)}
              isLeaving={leaving.has(item.id)}
              isSelected={selected.has(item.id)}
              onSelect={(id, mode) => setSelection((current) => selectEntry(keepVisible(current, visibleIds), visibleIds, id, mode))}
              onDragOut={(id) => void shelf.startDrag(targetIds(selection, id))}
              onOpen={(id) => void (revealOnDoubleClick ? shelf.reveal(id) : shelf.open(id))}
              onCopy={(id) => shelf.copy([id])}
              onReveal={(id) => void shelf.reveal(id)}
              onTogglePin={(id) => void shelf.togglePin(id)}
              onRemove={removeOne}
            />
          ))}
          {/* An open place on the shelf while there is room in the row: drop more here. */}
          {layout === "tiles" && !query && items.length < SHELF_TILE_LIMIT && (
            <div className="shelf-slot" aria-hidden="true">
              <Plus size={16} strokeWidth={1.5} absoluteStrokeWidth />
              <span>{t.fileShelf.moreSlot}</span>
            </div>
          )}
        </div>
      )}
      {layout !== "empty" && <p className="shelf-panel__footer">{t.fileShelf.footerHint(revealOnDoubleClick)}</p>}
      {isDropTarget && layout !== "empty" && (
        <div className="shelf-drop-overlay" aria-hidden="true">
          <span className="shelf-drop-overlay__icon">
            <ArrowDownToLine size={20} strokeWidth={1.5} absoluteStrokeWidth />
          </span>
          <span>{t.fileShelf.dropHint}</span>
        </div>
      )}
    </section>
  );
}
