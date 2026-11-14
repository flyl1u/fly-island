import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "../../i18n";
import { readClipboardImage, type ClipboardHistoryItem } from "./api";
import "./ClipboardImagePreview.css";

export function ClipboardImagePreview({ item, onClose }: { item: ClipboardHistoryItem; onClose: () => void }) {
  const t = useTranslation();
  const [original, setOriginal] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let cancelled = false;
    void readClipboardImage(item.id).then((url) => {
      if (!cancelled) setOriginal(url);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [item.id]);
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
        <div className="clipboard-preview__image" aria-busy={!original && !failed}>
          <img src={original ?? item.image?.thumbnailDataUrl} width={item.image?.width} height={item.image?.height} alt={t.clipboard.imagePreview} />
        </div>
        <div className="clipboard-preview__caption" role="status">
          <span>{t.clipboard.imageSize(item.image?.width ?? 0, item.image?.height ?? 0)}</span>
          {!original && <span>{failed ? t.clipboard.previewFailed : t.clipboard.loadingImage}</span>}
        </div>
      </div>
    </div>
  );
}
