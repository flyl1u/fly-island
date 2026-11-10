/**
 * A saved order of `allowed` items read back: unknown and repeated entries dropped, and any
 * item it lacks (one added in a later version) put at the end in its default place.
 */
export function normalizeOrder<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  const saved = Array.isArray(value) ? value : [];
  const kept = saved.filter((item, index): item is T => allowed.includes(item as T) && saved.indexOf(item) === index);
  return [...kept, ...allowed.filter((item) => !kept.includes(item))];
}

/** `items` with `item` moved to `index`; the same array when nothing moves. */
export function moveItem<T>(items: readonly T[], item: T, index: number): T[] {
  const from = items.indexOf(item);
  if (from === -1 || from === index) return items as T[];
  const next = items.filter((other) => other !== item);
  next.splice(Math.max(0, Math.min(index, next.length)), 0, item);
  return next;
}
