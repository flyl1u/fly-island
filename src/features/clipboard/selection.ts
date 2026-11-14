/** Selection survives filtering; only entries removed from the history are pruned. */
export function pruneSelection(selected: readonly string[], existingIds: readonly string[]): string[] {
  const existing = new Set(existingIds);
  return [...new Set(selected)].filter((id) => existing.has(id));
}

export function toggleSelection(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
}

export function allVisibleSelected(selected: readonly string[], visibleIds: readonly string[]): boolean {
  const ids = new Set(selected);
  return visibleIds.length > 0 && visibleIds.every((id) => ids.has(id));
}

/** Toggle only the current search/filter results, including rows not mounted yet. */
export function selectAllVisible(selected: readonly string[], visibleIds: readonly string[]): string[] {
  if (!allVisibleSelected(selected, visibleIds)) return [...new Set([...selected, ...visibleIds])];
  const visible = new Set(visibleIds);
  return selected.filter((id) => !visible.has(id));
}
