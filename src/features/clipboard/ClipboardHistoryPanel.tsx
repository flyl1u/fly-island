import { useTranslation } from "../../i18n";
import { useEffect, useState } from "react";
import type { ClipboardHistoryItem, ClipboardHistorySnapshot } from "./api";
import { ClipboardFilters } from "./ClipboardFilters";
import { ClipboardHistoryItemRow } from "./ClipboardHistoryItemRow";
import { ClipboardPanelHeader } from "./ClipboardPanelHeader";
import { useClipboardConfirmations } from "./useClipboardConfirmations";
import { useClipboardHistoryList } from "./useClipboardHistoryList";
import { useClipboardNoteEditor } from "./useClipboardNoteEditor";
import { useClipboardSelection } from "./useClipboardSelection";
import { ClipboardImagePreview } from "./ClipboardImagePreview";
import "./ClipboardHistoryPanel.css";
import "./ClipboardSelection.css";

export function ClipboardHistoryPanel({
  snapshot,
  onCopyItem,
  onToggleFavorite,
  onUpdateNote,
  onDeleteItem,
  onDeleteItems,
  variant = "island",
}: {
  snapshot: ClipboardHistorySnapshot;
  onCopyItem: (id: string) => Promise<boolean> | boolean;
  onToggleFavorite: (id: string) => Promise<void> | void;
  onUpdateNote: (id: string, note: string) => Promise<boolean> | boolean;
  onDeleteItem: (id: string) => Promise<void> | void;
  onDeleteItems: (ids: string[]) => Promise<boolean> | boolean;
  variant?: "island" | "window";
}) {
  const t = useTranslation();
  const {
    query,
    setQuery,
    clipboardView,
    setClipboardView,
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
  const selection = useClipboardSelection(snapshot.items.map((item) => item.id), filteredItems.map((item) => item.id), onDeleteItems);
  const [preview, setPreview] = useState<ClipboardHistoryItem | null>(null);
  useEffect(() => {
    if (!preview && !selection.selecting) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (preview) setPreview(null); else selection.exit();
    };
    document.addEventListener("keydown", escape, true);
    return () => document.removeEventListener("keydown", escape, true);
  }, [preview, selection]);
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

  return (
    <section className={`clipboard-panel clipboard-panel--${variant}`} aria-label={t.clipboard.title}>
      <div className="clipboard-panel__content" inert={preview !== null}>
        <ClipboardPanelHeader
          itemCount={snapshot.items.length}
          favoriteCount={favoriteItems.length}
          shortcutEnabled={snapshot.settings.shortcutEnabled}
          shortcut={snapshot.settings.shortcut}
          selecting={selection.selecting}
          selectedCount={selection.selectedIds.length}
          allSelected={selection.allSelected}
          deleting={selection.deleting}
          visibleCount={filteredItems.length}
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
          onViewChange={setClipboardView}
          onQueryChange={setQuery}
        />

        <div className="clipboard-list" role="list" onScroll={(event) => onListScroll(event.currentTarget)}>
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
              />
            ))
          )}
        </div>
      </div>
      {selection.failed && <p className="clipboard-selection-error" role="alert">{t.clipboard.deleteFailed}</p>}
      {preview && <ClipboardImagePreview key={preview.id} item={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}
