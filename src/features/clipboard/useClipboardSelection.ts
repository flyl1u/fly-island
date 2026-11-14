import { useState } from "react";
import { allVisibleSelected, pruneSelection, selectAllVisible, toggleSelection } from "./selection";

export function useClipboardSelection(
  existingIds: string[],
  visibleIds: string[],
  onDelete: (ids: string[]) => Promise<boolean> | boolean,
) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);
  const selectedIds = pruneSelection(selected, existingIds);
  const exit = () => {
    if (deleting) return;
    setSelecting(false);
    setSelected([]);
    setFailed(false);
  };
  const enter = () => { setSelecting(true); setSelected([]); setFailed(false); };
  const remove = async () => {
    if (deleting || selectedIds.length === 0) return;
    setDeleting(true);
    setFailed(false);
    try {
      if (await onDelete(selectedIds)) {
        setSelecting(false);
        setSelected([]);
      } else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setDeleting(false);
    }
  };
  return {
    selecting, selectedIds, deleting, failed, enter, exit, remove,
    allSelected: allVisibleSelected(selectedIds, visibleIds),
    toggle: (id: string) => { if (!deleting) setSelected(toggleSelection(selectedIds, id)); },
    selectAll: () => { if (!deleting) setSelected(selectAllVisible(selectedIds, visibleIds)); },
  };
}
