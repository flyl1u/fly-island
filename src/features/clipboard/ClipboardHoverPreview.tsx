import type { CSSProperties } from "react";
import { useTranslation } from "../../i18n";
import type { ClipboardHistoryItem } from "./api";
import { clipboardItemKind } from "./kind";
import { useClipboardOriginal } from "./useClipboardOriginal";
import { useClipboardThumbnail } from "./useClipboardThumbnail";
import "./ClipboardHoverPreview.css";

export function ClipboardHoverPreview({ item, above, offset, height, onEnter, onLeave }: {
  item: ClipboardHistoryItem;
  above: boolean;
  offset: number;
  height: number;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const t = useTranslation();
  const kind = clipboardItemKind(item);
  return (
    <div className="clipboard-hover-preview" role="region" aria-label={t.clipboard.contentPreview}
      data-clipboard-preview-for={item.id}
      style={{
        [above ? "bottom" : "top"]: offset,
        "--clipboard-hover-height": `${height}px`,
      } as CSSProperties}
      onPointerEnter={onEnter} onPointerLeave={onLeave}>
      {kind === "image" ? <HoverImage item={item} /> : (
        <div className="clipboard-hover-preview__text">
          {kind === "file" ? item.files?.join("\n") : item.text ?? item.preview}
        </div>
      )}
    </div>
  );
}

function HoverImage({ item }: { item: ClipboardHistoryItem }) {
  const t = useTranslation();
  const thumbnail = useClipboardThumbnail(item).url;
  const { original, failed } = useClipboardOriginal(item.id);
  const url = original ?? thumbnail;
  return (
    <>
      {url && <img src={url} alt={t.clipboard.imagePreview} />}
      <div className="clipboard-hover-preview__caption" role="status">
        {item.image && t.clipboard.imageSize(item.image.width, item.image.height)}
        {!original && <span>{failed ? t.clipboard.previewFailed : t.clipboard.loadingImage}</span>}
      </div>
    </>
  );
}
