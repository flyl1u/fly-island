import { useLayoutEffect, useRef } from "react";
import type { TodoItem } from "./types";

/** Extra inline controls grow the island; capped lists still scroll in their normal container. */
export function useTodoListHeight(todos: TodoItem[], onHeight?: (height: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const list = ref.current;
    if (!list || !onHeight) return;
    const measure = () => {
      const rows = Array.from(list.children) as HTMLElement[];
      const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
      const height = rows.reduce((sum, row) => sum + row.offsetHeight, 0) + Math.max(0, rows.length - 1) * gap;
      if (height > 0) onHeight(height);
    };
    const observer = new ResizeObserver(measure);
    Array.from(list.children).forEach((row) => observer.observe(row));
    measure();
    return () => observer.disconnect();
  }, [onHeight, todos]);
  return ref;
}
