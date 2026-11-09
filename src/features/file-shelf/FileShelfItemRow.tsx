import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Check, Copy, FolderOpen, Pin, PinOff, X } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { FileShelfItem } from "./api";
import { formatFileSize, getTypeLabel } from "./fileShelf";
import { FileShelfItemIcon } from "./FileShelfItemIcon";
import type { SelectMode } from "./selection";
import "./FileShelfItemRow.css";

// Movement (px) that turns a press on a row into a drag, so double-clicks still open.
const DRAG_THRESHOLD_PX = 4;
const COPIED_FLASH_MS = 1_100;

function selectMode(event: ReactMouseEvent): SelectMode {
  if (event.shiftKey) return "range";
  return event.ctrlKey || event.metaKey ? "toggle" : "single";
}

export function FileShelfItemRow({
  item,
  isRecent,
  isSelected,
  onSelect,
  onDragOut,
  onOpen,
  onCopy,
  onReveal,
  onTogglePin,
  onRemove,
}: {
  item: FileShelfItem;
  /** Just added (or moved to the top) by a drop. */
  isRecent: boolean;
  isSelected: boolean;
  onSelect: (id: string, mode: SelectMode) => void;
  /** Drags this entry out, with the rest of the selection when it is selected. */
  onDragOut: (id: string) => void;
  onOpen: (id: string) => void;
  onCopy: (id: string) => Promise<boolean>;
  onReveal: (id: string) => void;
  onTogglePin: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const t = useTranslation();
  const [copied, setCopied] = useState(false);
  const pressRef = useRef<{ x: number; y: number } | null>(null);
  const isAvailable = !item.missing && !item.unreachable;

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const press = (event: ReactPointerEvent) => {
    pressRef.current = event.button === 0 && isAvailable ? { x: event.clientX, y: event.clientY } : null;
  };
  const move = (event: ReactPointerEvent) => {
    const start = pressRef.current;
    if (!start) return;
    if ((event.buttons & 1) === 0) {
      pressRef.current = null;
      return;
    }
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < DRAG_THRESHOLD_PX) return;
    pressRef.current = null;
    onDragOut(item.id);
  };

  const status = item.missing ? t.fileShelf.missing : item.unreachable ? t.fileShelf.unreachable : null;
  const className = [
    "shelf-item",
    item.missing ? "shelf-item--missing" : "",
    item.unreachable ? "shelf-item--unreachable" : "",
    item.pinned ? "shelf-item--pinned" : "",
    isSelected ? "shelf-item--selected" : "",
    isRecent ? "shelf-item--recent" : "",
  ].filter(Boolean).join(" ");

  return (
    <article className={className} role="listitem" aria-selected={isSelected} data-shelf-id={item.id}>
      <button
        className="shelf-item__main"
        type="button"
        onPointerDown={press}
        onPointerMove={move}
        onPointerUp={() => {
          pressRef.current = null;
        }}
        onClick={(event) => onSelect(item.id, selectMode(event))}
        onDoubleClick={() => {
          if (isAvailable) onOpen(item.id);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && isAvailable) onOpen(item.id);
        }}
      >
        <FileShelfItemIcon id={item.id} name={item.name} isDir={item.isDir} available={isAvailable} />
        <span className="shelf-item__body">
          <span className="shelf-item__name">{item.name}</span>
          <span className="shelf-item__meta">
            {status ?? (item.isDir ? t.fileShelf.folder : [getTypeLabel(item.name, false), formatFileSize(item.size)].filter(Boolean).join(" · "))}
          </span>
        </span>
      </button>
      <div className="shelf-item__actions">
        {isAvailable && (
          <>
            <button
              className={`shelf-copy-button${copied ? " shelf-copy-button--copied" : ""}`}
              type="button"
              aria-label={copied ? t.fileShelf.copied : t.fileShelf.copyItem}
              onClick={() => {
                void onCopy(item.id).then((ok) => setCopied(ok));
              }}
            >
              {copied ? <Check size={14} strokeWidth={2.6} /> : <Copy size={14} strokeWidth={2.2} />}
            </button>
            <button
              type="button"
              aria-label={t.fileShelf.reveal}
              onClick={() => onReveal(item.id)}
            >
              <FolderOpen size={14} strokeWidth={2.2} />
            </button>
          </>
        )}
        <button
          className={`shelf-pin-button${item.pinned ? " shelf-pin-button--active" : ""}`}
          type="button"
          aria-label={item.pinned ? t.fileShelf.unpin : t.fileShelf.pin}
          aria-pressed={item.pinned}
          onClick={() => onTogglePin(item.id)}
        >
          {item.pinned ? <PinOff size={14} strokeWidth={2.2} /> : <Pin size={14} strokeWidth={2.2} />}
        </button>
        <button
          type="button"
          aria-label={t.fileShelf.removeItem}
          onClick={() => onRemove(item.id)}
        >
          <X size={14} strokeWidth={2.4} />
        </button>
      </div>
    </article>
  );
}
