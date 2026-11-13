import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { moveItem } from "../../utils/order.ts";
import { reorderIndex } from "./reorderIndex.ts";
import { todoLayoutTop, todoMotionOptions, todoReducedMotion, todoScrollContainer } from "./todoDragGeometry";
import type { TodoItem } from "./types";

type Press = {
  id: string; pointerId: number; handle: HTMLButtonElement; row: HTMLElement;
  x: number; y: number; currentY: number; top: number; active: boolean;
  original: string[]; order: string[]; scroll: HTMLElement | null;
};

/** listRef 与列表高度测量共用同一个列表元素。 */
export function useTodoDrag(listRef: RefObject<HTMLDivElement | null>, todos: TodoItem[], enabled: boolean,
  editingId: string | null, onMove: (id: string, index: number) => void) {
  const press = useRef<Press | null>(null);
  const frame = useRef(0);
  const landing = useRef<{ row: HTMLElement; top: number } | null>(null);
  const [previewOrder, setPreviewOrder] = useState<string[] | null>(null);
  const [draggedTodoId, setDraggedTodoId] = useState<string | null>(null);

  function follow(current: Press) {
    current.row.style.transform = `translateY(${current.currentY - current.y - (todoLayoutTop(current.row) - current.top)}px) scale(1.02)`;
  }

  function update(current: Press) {
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-todo-id]") ?? [])]
      .filter((row) => row.dataset.todoId !== current.id);
    const index = reorderIndex(rows.map((row) => todoLayoutTop(row) + row.offsetHeight / 2), current.currentY,
      current.order.indexOf(current.id));
    if (index !== current.order.indexOf(current.id)) {
      current.order = moveItem(current.order, current.id, index);
      setPreviewOrder(current.order);
    }
    follow(current);
  }

  function tick() {
    const current = press.current;
    if (!current?.active) return;
    if (current.scroll) {
      const rect = current.scroll.getBoundingClientRect();
      const delta = current.currentY < rect.top + 24 ? -6 : current.currentY > rect.bottom - 24 ? 6 : 0;
      current.scroll.scrollTop += delta;
    }
    update(current);
    frame.current = requestAnimationFrame(tick);
  }

  function move(event: PointerEvent) {
    const current = press.current;
    if (!current || current.pointerId !== event.pointerId) return;
    current.currentY = event.clientY;
    if (!current.active) {
      if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < 4) return;
      current.active = true;
      setDraggedTodoId(current.id);
      setPreviewOrder(current.order);
      frame.current = requestAnimationFrame(tick);
    }
    event.preventDefault();
  }

  function finish(event: PointerEvent) {
    if (event.pointerId !== press.current?.pointerId) return;
    if (press.current.active) { press.current.currentY = event.clientY; update(press.current); }
    end(true);
  }

  function cancel(event: PointerEvent) {
    if (event.pointerId === press.current?.pointerId) end(false);
  }

  // 拖动中的移动和松手在 window 上监听，不靠手柄的指针捕获：往下拖时 React 会把被拖的行
  // 摘下再插回 DOM，捕获随之丢失，松手事件送不到手柄，行就悬在半空。
  const latest = useRef({ move, finish, cancel });
  useLayoutEffect(() => { latest.current = { move, finish, cancel }; });
  const listeners = useRef({
    move: (event: PointerEvent) => latest.current.move(event),
    finish: (event: PointerEvent) => latest.current.finish(event),
    cancel: (event: PointerEvent) => latest.current.cancel(event),
  });

  function listen(on: boolean) {
    const method = on ? window.addEventListener : window.removeEventListener;
    method("pointermove", listeners.current.move, true);
    method("pointerup", listeners.current.finish, true);
    method("pointercancel", listeners.current.cancel, true);
  }

  function end(commit: boolean) {
    const current = press.current;
    if (!current) return;
    listen(false);
    cancelAnimationFrame(frame.current);
    if (current.active) {
      follow(current);
      landing.current = { row: current.row, top: current.row.getBoundingClientRect().top };
      const index = current.order.indexOf(current.id);
      if (commit && index !== current.original.indexOf(current.id)) onMove(current.id, index);
    }
    if (current.handle.hasPointerCapture(current.pointerId)) current.handle.releasePointerCapture(current.pointerId);
    press.current = null;
    setPreviewOrder(null);
    setDraggedTodoId(null);
  }

  useLayoutEffect(() => {
    if (press.current?.active) follow(press.current);
    const drop = landing.current;
    if (!drop) return;
    landing.current = null;
    drop.row.style.transform = "";
    const delta = drop.top - todoLayoutTop(drop.row);
    if (!todoReducedMotion()) {
      drop.row.dataset.todoSettling = "true";
      const animation = drop.row.animate([{ transform: `translateY(${delta}px) scale(1.02)` }, { transform: "none" }], todoMotionOptions);
      const clear = () => { delete drop.row.dataset.todoSettling; };
      animation.onfinish = clear;
      animation.oncancel = clear;
    }
  }, [previewOrder, draggedTodoId]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") end(false); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  });
  useEffect(() => () => {
    listen(false);
    cancelAnimationFrame(frame.current);
    const current = press.current;
    if (current?.handle.hasPointerCapture(current.pointerId)) current.handle.releasePointerCapture(current.pointerId);
    if (current) current.row.style.transform = "";
  }, []);

  return {
    previewOrder, draggedTodoId,
    startTodoDrag(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
      if (!enabled || editingId === id || event.button !== 0 || press.current) return;
      const row = event.currentTarget.closest<HTMLElement>("[data-todo-id]");
      if (!row) return;
      event.preventDefault();
      row.getAnimations().forEach((animation) => animation.cancel());
      const original = todos.map((todo) => todo.id);
      press.current = { id, pointerId: event.pointerId, handle: event.currentTarget, row,
        x: event.clientX, y: event.clientY, currentY: event.clientY, top: todoLayoutTop(row),
        active: false, original, order: original, scroll: todoScrollContainer(row) };
      // 使用指针捕获，避免窗口的原生文件拖放接管 HTML5 拖动。
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* 合成事件没有原生指针。 */ }
      listen(true);
    },
  };
}
