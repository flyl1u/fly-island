import type { KeyboardEvent, ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { moveItem } from "../../utils/order.ts";
import { usePointerReorder } from "./usePointerReorder";
import "./ReorderList.css";

export type ReorderRow<T extends string> = {
  id: T;
  name: string;
  hint?: string;
  /** Shown before the name, such as the item's icon. */
  icon?: ReactNode;
};

/**
 * A short numbered list put in order by dragging a row anywhere, or with the up and down arrow
 * keys on its handle. `onReorder` gets each new order of the ids.
 */
export function ReorderList<T extends string>({
  rows,
  onReorder,
  moveLabel,
}: {
  rows: ReorderRow<T>[];
  onReorder: (order: T[]) => void;
  /** The handle's label for a row, saying it can be dragged or moved with the arrow keys. */
  moveLabel: (name: string) => string;
}) {
  const order = rows.map((row) => row.id);
  const { containerRef, itemProps, draggingId } = usePointerReorder(order, onReorder, "y");

  const moveWithKeys = (id: T, event: KeyboardEvent) => {
    const step = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = moveItem(order, id, order.indexOf(id) + step);
    if (next !== order) onReorder(next);
  };

  return (
    <ol className="reorder-list" ref={(node) => { containerRef.current = node; }}>
      {rows.map((row, index) => (
        <li
          key={row.id}
          className={`reorder-list__item${draggingId === row.id ? " reorder-list__item--dragging" : ""}`}
          {...itemProps(row.id)}
        >
          <span className="reorder-list__rank" aria-hidden="true">{index + 1}</span>
          {row.icon}
          <span className="reorder-list__text">
            <span className="reorder-list__name">{row.name}</span>
            {row.hint && <span className="reorder-list__hint">{row.hint}</span>}
          </span>
          <button
            className="reorder-list__handle"
            type="button"
            aria-label={moveLabel(row.name)}
            onKeyDown={(event) => moveWithKeys(row.id, event)}
          >
            <GripVertical size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
          </button>
        </li>
      ))}
    </ol>
  );
}
