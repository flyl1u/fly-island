import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import type { MessageSource } from "./messagePreview";
import { loadSourceOrder, MESSAGE_SOURCE_ORDER_KEY, moveSource, saveSourceOrder } from "./sourceOrder";

const HOLD_MS = 450;
/** Moving further than this before the hold completes is a scroll or a click, not a drag. */
const SLOP_PX = 6;

/**
 * Press and hold a tab, then slide it sideways to reorder the tabs. The tabs look the same
 * throughout; only their order changes, saved on release. The click ending a drag is swallowed.
 */
export function useSourceReorder(visible: readonly MessageSource[]) {
  const [order, setOrder] = useState(loadSourceOrder);
  const press = useRef<{ source: MessageSource; x: number; y: number; timer: number; dragging: boolean } | null>(null);
  const swallowClick = useRef(false);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if ((event.key === null || event.key === MESSAGE_SOURCE_ORDER_KEY) && !press.current?.dragging) setOrder(loadSourceOrder());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  useEffect(() => () => { if (press.current) window.clearTimeout(press.current.timer); }, []);

  const end = useCallback(() => {
    const current = press.current;
    press.current = null;
    if (!current) return;
    window.clearTimeout(current.timer);
    if (current.dragging) {
      swallowClick.current = true;
      setOrder((latest) => { saveSourceOrder(latest); return latest; });
    }
  }, []);

  const handlers = (source: MessageSource) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      const target = event.currentTarget;
      const pointerId = event.pointerId;
      const timer = window.setTimeout(() => {
        if (press.current?.source !== source) return;
        press.current.dragging = true;
        try { target.setPointerCapture(pointerId); } catch { /* the pointer is already gone */ }
      }, HOLD_MS);
      press.current = { source, x: event.clientX, y: event.clientY, timer, dragging: false };
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      const current = press.current;
      if (!current || current.source !== source) return;
      if (!current.dragging) {
        if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > SLOP_PX) end();
        return;
      }
      const tabs = [...(event.currentTarget.parentElement?.querySelectorAll<HTMLElement>("[data-message-source]") ?? [])];
      const over = tabs.find((tab) => {
        const box = tab.getBoundingClientRect();
        return tab !== event.currentTarget && event.clientX >= box.left && event.clientX <= box.right;
      });
      const target = over?.dataset.messageSource as MessageSource | undefined;
      if (!target || !over) return;
      // Swap once the pointer passes the neighbour's middle, so the tab does not flicker back.
      const box = over.getBoundingClientRect();
      const mine = event.currentTarget.getBoundingClientRect();
      const middle = box.left + box.width / 2;
      if ((mine.left < box.left && event.clientX < middle) || (mine.left > box.left && event.clientX > middle)) return;
      setOrder((latest) => moveSource(latest, latest.filter((item) => visible.includes(item)), source, target));
    },
    onPointerUp: end,
    onPointerCancel: end,
    onContextMenu: (event: MouseEvent<HTMLButtonElement>) => { if (press.current) event.preventDefault(); },
  });

  /** Whether the click that just arrived ends a drag and should not switch tabs. */
  const consumeDragClick = () => {
    const swallow = swallowClick.current;
    swallowClick.current = false;
    return swallow;
  };

  return { order, handlers, consumeDragClick };
}
