import { useTranslation } from "../../i18n";
import { useEffect, useRef, useState } from "react";
import type { ClipboardHistoryItem, ClipboardHistorySnapshot } from "./api";
import { ClipboardFilters } from "./ClipboardFilters";
import { ClipboardHistoryItemRow } from "./ClipboardHistoryItemRow";
import { ClipboardPanelHeader } from "./ClipboardPanelHeader";
import { useClipboardConfirmations } from "./useClipboardConfirmations";
import { useClipboardHistoryList } from "./useClipboardHistoryList";
import { useClipboardNoteEditor } from "./useClipboardNoteEditor";
import { useClipboardSelection } from "./useClipboardSelection";
import { selectableIds } from "./selection";
import { ClipboardImagePreview } from "./ClipboardImagePreview";
import { ClipboardHoverPreview } from "./ClipboardHoverPreview";
import { useClipboardHoverPreview } from "./useClipboardHoverPreview";
import "./ClipboardHistoryPanel.css";
import "./ClipboardSelection.css";

export function ClipboardHistoryPanel({
  snapshot,
  onCopyItem,
  onToggleFavorite,
  onUpdateNote,
  onDeleteItem,
  onDeleteItems,
  hoverPreview = false,
  variant = "island",
}: {
  snapshot: ClipboardHistorySnapshot;
  onCopyItem: (id: string) => Promise<boolean> | boolean;
  onToggleFavorite: (id: string) => Promise<void> | void;
  onUpdateNote: (id: string, note: string) => Promise<boolean> | boolean;
  onDeleteItem: (id: string) => Promise<void> | void;
  onDeleteItems: (ids: string[]) => Promise<boolean> | boolean;
  hoverPreview?: boolean;
  variant?: "island" | "window";
}) {
  const t = useTranslation();
  const {
    query,
    setQuery,
    clipboardView,
    setClipboardView,
    kindFilter,
    setKindFilter,
    favoriteItems,
    filteredItems,
    renderedItems,
    onListScroll,
    itemElementsRef,
  } = useClipboardHistoryList(snapshot.items);
  const {
    confirmDeleteId,
    dismissConfirmations,
    handleDeleteItem,
  } = useClipboardConfirmations(snapshot.items, onDeleteItem);
  // Select all leaves favorites out: they are kept unless picked one by one.
  const selectable = selectableIds(filteredItems);
  const selection = useClipboardSelection(snapshot.items.map((item) => item.id), selectable, onDeleteItems);
  const [preview, setPreview] = useState<ClipboardHistoryItem | null>(null);
  const {
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
  } = useClipboardNoteEditor(
    snapshot.items,
    onCopyItem,
    onToggleFavorite,
    onUpdateNote,
    dismissConfirmations,
  );
  const panel = useRef<HTMLElement>(null);
  const canHover = hoverPreview && !preview && !selection.selecting && !editingNoteId;
  const hover = useClipboardHoverPreview(canHover, panel);
  const hoveredItem = hover.preview && renderedItems.find((item) => item.id === hover.preview?.id);
  const dismissHover = hover.dismiss;
  useEffect(() => {
    if (!preview && !hoveredItem && !selection.selecting) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (preview) setPreview(null);
      else if (hoveredItem) dismissHover();
      else selection.exit();
    };
    document.addEventListener("keydown", escape, true);
    return () => document.removeEventListener("keydown", escape, true);
  }, [dismissHover, hoveredItem, preview, selection]);

  return (
    <section ref={panel} className={`clipboard-panel clipboard-panel--${variant}`} aria-label={t.clipboard.title}>
      <div className="clipboard-panel__content" inert={preview !== null} onClickCapture={canHover ? dismissHover : undefined}>
        <ClipboardPanelHeader
          itemCount={snapshot.items.length}
          favoriteCount={favoriteItems.length}
          shortcutEnabled={snapshot.settings.shortcutEnabled}
          shortcut={snapshot.settings.shortcut}
          selecting={selection.selecting}
          selectedCount={selection.selectedIds.length}
          allSelected={selection.allSelected}
          deleting={selection.deleting}
          visibleCount={selectable.length}
          onSelectAll={selection.selectAll}
          onCancel={selection.exit}
          onDelete={() => {
            if (selection.selecting) void selection.remove();
            else { cancelEditingNote(); dismissConfirmations(); selection.enter(); }
          }}
        />

        <ClipboardFilters
          view={clipboardView}
          query={query}
          kind={kindFilter}
          onViewChange={setClipboardView}
          onQueryChange={setQuery}
          onKindChange={setKindFilter}
        />

        <div className="clipboard-list" role="list" onScroll={(event) => {
          if (canHover) dismissHover();
          onListScroll(event.currentTarget);
        }}>
          {filteredItems.length === 0 ? (
            <div className="clipboard-empty">
              {snapshot.items.length === 0
                ? t.clipboard.emptyAll
                : clipboardView === "favorites" && favoriteItems.length === 0
                  ? t.clipboard.emptyFavorites
                  : t.clipboard.emptySearch}
            </div>
          ) : (
            renderedItems.map((item) => (
              <ClipboardHistoryItemRow
                key={item.id}
                item={item}
                elementRef={(node) => {
                  if (node) {
                    itemElementsRef.current.set(item.id, node);
                  } else {
                    itemElementsRef.current.delete(item.id);
                  }
                }}
                isEditingNote={editingNoteId === item.id}
                noteDraft={noteDraft}
                isSavingNote={isSavingNote}
                isConfirmingDelete={confirmDeleteId === item.id}
                isCopied={copiedItemId === item.id}
                onCopy={handleCopyItem}
                onToggleFavorite={handleToggleFavorite}
                onStartEditNote={startEditingNote}
                onNoteDraftChange={setNoteDraft}
                onSaveNote={saveNote}
                onCancelEditNote={cancelEditingNote}
                onDelete={handleDeleteItem}
                selecting={selection.selecting}
                selected={selection.selectedIds.includes(item.id)}
                onSelect={selection.toggle}
                onPreview={setPreview}
                onHover={canHover ? hover.start : undefined}
                onHoverLeave={canHover ? hover.leave : undefined}
              />
            ))
          )}
        </div>
      </div>
      {selection.failed && <p className="clipboard-selection-error" role="alert">{t.clipboard.deleteFailed}</p>}
      {preview && <ClipboardImagePreview key={preview.id} item={preview} onClose={() => setPreview(null)} />}
      {hover.preview && hoveredItem && (
        <ClipboardHoverPreview key={hoveredItem.id} item={hoveredItem} above={hover.preview.above}
          offset={hover.preview.offset} height={hover.preview.height} onEnter={hover.hold} onLeave={hover.leave} />
      )}
    </section>
  );
}
