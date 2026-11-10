import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { moveItem } from "../../utils/order.ts";

/** How far (px) the pointer moves before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD = 4;

type Press = { id: string; x: number; y: number; pointerId: number; dragging: boolean };

/**
 * Reordering a row or line of items by dragging one with the pointer. Pointer events, not HTML
 * drag and drop: the island's window takes native file drops, which keeps HTML drags from
 * reaching the page. Each item carries `data-reorder-id` inside `containerRef`; while one is
 * dragged it swaps places as the pointer crosses its neighbours, and `onReorder` gets every new
 * order. A press that moved less than a few pixels stays a click; after a drag, `wasDragged()`
 * is true until the next press, so the item's click handler can ignore that click.
 */
export function usePointerReorder<T extends string>(
  items: readonly T[],
  onReorder: (next: T[]) => void,
  axis: "x" | "y",
) {
  const containerRef = useRef<HTMLElement | null>(null);
  const press = useRef<Press | null>(null);
  const dragged = useRef(false);
  const [draggingId, setDraggingId] = useState<T | null>(null);

  const itemProps = useCallback((id: T) => ({
    "data-reorder-id": id,
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (event.button !== 0) return;
      dragged.current = false;
      press.current = { id, x: event.clientX, y: event.clientY, pointerId: event.pointerId, dragging: false };
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      const current = press.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (!current.dragging) {
        if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < DRAG_THRESHOLD) return;
        current.dragging = true;
        dragged.current = true;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // A pointer that is no longer down cannot be captured; the drag still works without.
        }
        setDraggingId(id);
      }
      const container = containerRef.current;
      if (!container) return;
      const others = [...container.querySelectorAll<HTMLElement>("[data-reorder-id]")];
      const at = axis === "x" ? event.clientX : event.clientY;
      // The item whose half the pointer is over takes the dragged one's place.
      const target = others.find((element) => {
        const rect = element.getBoundingClientRect();
        return axis === "x" ? at >= rect.left && at <= rect.right : at >= rect.top && at <= rect.bottom;
      });
      const targetId = target?.dataset.reorderId as T | undefined;
      if (!targetId || targetId === id) return;
      const next = moveItem(items, id, items.indexOf(targetId));
      if (next !== items) onReorder(next);
    },
    onPointerUp(event: ReactPointerEvent<HTMLElement>) {
      if (press.current?.pointerId !== event.pointerId) return;
      press.current = null;
      setDraggingId(null);
    },
    onPointerCancel() {
      press.current = null;
      setDraggingId(null);
    },
  }), [axis, items, onReorder]);

  const wasDragged = useCallback(() => dragged.current, []);

  return { containerRef, itemProps, draggingId, wasDragged };
}
