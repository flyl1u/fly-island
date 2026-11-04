import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Check, Copy, File, FileArchive, FileAudio, FileImage, FileText, FileVideo, Folder, FolderOpen, X, type LucideIcon } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { FileShelfItem } from "./api";
import { formatFileSize, getFileKind, type FileKind } from "./fileShelf";
import "./FileShelfItemRow.css";

const KIND_ICONS: Record<FileKind, LucideIcon> = {
  folder: Folder,
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  archive: FileArchive,
  text: FileText,
  file: File,
};

// Movement (px) that turns a press on a row into a drag, so double-clicks still open.
const DRAG_THRESHOLD_PX = 4;
const COPIED_FLASH_MS = 1_100;

export function FileShelfItemRow({
  item,
  onDragOut,
  onOpen,
  onCopy,
  onReveal,
  onRemove,
}: {
  item: FileShelfItem;
  onDragOut: (id: string) => void;
  onOpen: (id: string) => void;
  onCopy: (id: string) => Promise<boolean>;
  onReveal: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const t = useTranslation();
  const [copied, setCopied] = useState(false);
  const pressRef = useRef<{ x: number; y: number } | null>(null);
  const Icon = KIND_ICONS[getFileKind(item.name, item.isDir)];

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const press = (event: ReactPointerEvent) => {
    pressRef.current = event.button === 0 && !item.missing ? { x: event.clientX, y: event.clientY } : null;
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

  return (
    <article className={`shelf-item${item.missing ? " shelf-item--missing" : ""}`} role="listitem">
      <button
        className="shelf-item__main"
        type="button"
        title={item.missing ? `${t.fileShelf.missingHint}\n${item.path}` : `${t.fileShelf.dragHint}\n${item.path}`}
        onPointerDown={press}
        onPointerMove={move}
        onPointerUp={() => {
          pressRef.current = null;
        }}
        onDoubleClick={() => {
          if (!item.missing) onOpen(item.id);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !item.missing) onOpen(item.id);
        }}
      >
        <span className="shelf-item__icon" aria-hidden="true">
          <Icon size={20} strokeWidth={1.9} />
        </span>
        <span className="shelf-item__body">
          <span className="shelf-item__name">{item.name}</span>
          <span className="shelf-item__meta">
            {item.missing ? t.fileShelf.missing : item.isDir ? t.fileShelf.folder : formatFileSize(item.size)}
          </span>
        </span>
      </button>
      <div className="shelf-item__actions">
        {!item.missing && (
          <>
            <button
              className={`shelf-copy-button${copied ? " shelf-copy-button--copied" : ""}`}
              type="button"
              title={copied ? t.fileShelf.copied : t.fileShelf.copyItem}
              aria-label={copied ? t.fileShelf.copied : t.fileShelf.copyItem}
              onClick={() => {
                void onCopy(item.id).then((ok) => setCopied(ok));
              }}
            >
              {copied ? <Check size={14} strokeWidth={2.6} /> : <Copy size={14} strokeWidth={2.2} />}
            </button>
            <button
              type="button"
              title={t.fileShelf.reveal}
              aria-label={t.fileShelf.reveal}
              onClick={() => onReveal(item.id)}
            >
              <FolderOpen size={14} strokeWidth={2.2} />
            </button>
          </>
        )}
        <button
          type="button"
          title={t.fileShelf.removeItem}
          aria-label={t.fileShelf.removeItem}
          onClick={() => onRemove(item.id)}
        >
          <X size={14} strokeWidth={2.4} />
        </button>
      </div>
    </article>
  );
}
