/** 其余行按布局顺序排列；源位置也是没有越过中线时的插入位置。 */
export function reorderIndex(midpoints: readonly number[], pointerY: number, sourceIndex: number): number {
  if (!midpoints.length) return Math.max(0, sourceIndex);
  const index = midpoints.findIndex((middle) => pointerY < middle);
  return index < 0 ? midpoints.length : index;
}
