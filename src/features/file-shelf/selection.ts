import { pathKey } from "./fileShelf.ts";

/** How a click on an entry changes the selection, as in Explorer. */
export type SelectMode = "single" | "toggle" | "range";

export type ShelfSelection = {
  ids: string[];
  /** Where a Shift-click range starts: the last entry clicked without Shift. */
  anchor: string | null;
};

export const EMPTY_SELECTION: ShelfSelection = { ids: [], anchor: null };

/**
 * The selection after clicking `id`. A plain click selects only it, Ctrl toggles it,
 * and Shift selects every visible entry from the anchor to it. `visibleIds` is the
 * list in display order; the result keeps that order.
 */
export function selectEntry(
  selection: ShelfSelection,
  visibleIds: string[],
  id: string,
  mode: SelectMode,
): ShelfSelection {
  if (mode === "range" && selection.anchor && visibleIds.includes(selection.anchor)) {
    const from = visibleIds.indexOf(selection.anchor);
    const to = visibleIds.indexOf(id);
    const [start, end] = from <= to ? [from, to] : [to, from];
    return { ids: visibleIds.slice(start, end + 1), anchor: selection.anchor };
  }
  if (mode === "toggle") {
    const chosen = new Set(selection.ids);
    if (chosen.has(id)) chosen.delete(id);
    else chosen.add(id);
    return { ids: visibleIds.filter((visible) => chosen.has(visible)), anchor: id };
  }
  return { ids: [id], anchor: id };
}

/** Drops ids that are no longer in the list (removed, cleaned up or filtered out). */
export function keepVisible(selection: ShelfSelection, visibleIds: string[]): ShelfSelection {
  const ids = selection.ids.filter((id) => visibleIds.includes(id));
  const anchor = selection.anchor && visibleIds.includes(selection.anchor) ? selection.anchor : null;
  return ids.length === selection.ids.length && anchor === selection.anchor ? selection : { ids, anchor };
}

/** The entries to drag or act on from `id`: the whole selection if `id` is in it. */
export function targetIds(selection: ShelfSelection, id: string) {
  return selection.ids.includes(id) ? selection.ids : [id];
}

/** Entries whose name or path contains `query`, ignoring case and slash style. */
export function filterShelfItems<T extends { name: string; path: string }>(items: T[], query: string) {
  const needle = pathKey(query.trim());
  if (!needle) return items;
  return items.filter((item) => pathKey(item.name).includes(needle) || pathKey(item.path).includes(needle));
}
