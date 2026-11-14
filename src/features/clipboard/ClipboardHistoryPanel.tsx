import { useTranslation } from "../../i18n";
import type { ClipboardHistorySnapshot } from "./api";
import { ClipboardFilters } from "./ClipboardFilters";
import { ClipboardHistoryItemRow } from "./ClipboardHistoryItemRow";
import { ClipboardPanelHeader } from "./ClipboardPanelHeader";
import { useClipboardConfirmations } from "./useClipboardConfirmations";
import { useClipboardHistoryList } from "./useClipboardHistoryList";
import { useClipboardNoteEditor } from "./useClipboardNoteEditor";
import "./ClipboardHistoryPanel.css";

export function ClipboardHistoryPanel({
  snapshot,
  onCopyItem,
  onToggleFavorite,
  onUpdateNote,
  onDeleteItem,
  onClear,
}: {
  snapshot: ClipboardHistorySnapshot;
  onCopyItem: (id: string) => Promise<boolean> | boolean;
  onToggleFavorite: (id: string) => Promise<void> | void;
  onUpdateNote: (id: string, note: string) => Promise<boolean> | boolean;
  onDeleteItem: (id: string) => Promise<void> | void;
  onClear: () => Promise<void> | void;
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
    isConfirmingClear,
    dismissConfirmations,
    handleDeleteItem,
    handleClear,
  } = useClipboardConfirmations(snapshot.items, onDeleteItem, onClear);
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
    <section className="clipboard-panel" aria-label={t.clipboard.title}>
      <ClipboardPanelHeader
        itemCount={snapshot.items.length}
        favoriteCount={favoriteItems.length}
        shortcutEnabled={snapshot.settings.shortcutEnabled}
        shortcut={snapshot.settings.shortcut}
        isConfirmingClear={isConfirmingClear}
        onClear={handleClear}
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
            />
          ))
        )}
      </div>
    </section>
  );
}
