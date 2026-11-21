import { useEffect, useRef, type CSSProperties } from "react";
import { X } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { ClipboardHistoryItem } from "./api";
import { useClipboardOriginal } from "./useClipboardOriginal";
import { useClipboardThumbnail } from "./useClipboardThumbnail";
import "./ClipboardImagePreview.css";

export function ClipboardImagePreview({ item, onClose }: { item: ClipboardHistoryItem; onClose: () => void }) {
  const t = useTranslation();
  const { original, failed } = useClipboardOriginal(item.id);
  const closeRef = useRef<HTMLButtonElement>(null);
  const thumbnail = useClipboardThumbnail(item).url;
  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    const trapTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      event.preventDefault();
      closeRef.current?.focus();
    };
    document.addEventListener("keydown", trapTab, true);
    return () => {
      document.removeEventListener("keydown", trapTab, true);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return (
    <div className="clipboard-preview" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="clipboard-preview__dialog" role="dialog" aria-modal="true" aria-label={t.clipboard.imagePreview}>
        <button ref={closeRef} className="clipboard-preview__close icon-button" type="button" aria-label={t.clipboard.closePreview} onClick={onClose}>
          <X size={16} strokeWidth={1.5} absoluteStrokeWidth />
        </button>
        <div className="clipboard-preview__image" aria-busy={!original && !failed} style={previewSize(item)}>
          <img src={original ?? thumbnail ?? undefined} width={item.image?.width} height={item.image?.height} alt={t.clipboard.imagePreview} />
        </div>
        <div className="clipboard-preview__caption" role="status">
          <span>{t.clipboard.imageSize(item.image?.width ?? 0, item.image?.height ?? 0)}</span>
          {!original && <span>{failed ? t.clipboard.previewFailed : t.clipboard.loadingImage}</span>}
        </div>
      </div>
    </div>
  );
}

/** Sizes the image from the original's dimensions, so the small thumbnail shown while loading
 * already fills the final box and the original replaces it without a jump. */
function previewSize(item: ClipboardHistoryItem) {
  const width = item.image?.width ?? 0;
  const height = item.image?.height ?? 0;
  if (width <= 0 || height <= 0) return undefined;
  return { "--preview-width": `${width}px`, "--preview-ratio": width / height } as CSSProperties;
}
