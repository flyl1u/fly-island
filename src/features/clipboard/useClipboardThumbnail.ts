import { useEffect, useState } from "react";
import { readClipboardThumbnail, type ClipboardHistoryItem } from "./api";
import { cachedThumbnail, loadThumbnail } from "./thumbnailCache";

type Thumbnail = { id: string; url: string | null; failed: boolean };

/**
 * An image row's thumbnail: inline when an older history still has it, otherwise read once the
 * row is mounted (the list mounts rows in batches as it scrolls) and then cached.
 */
export function useClipboardThumbnail(item: ClipboardHistoryItem) {
  const inline = item.image?.thumbnailDataUrl || null;
  const id = item.kind === "image" && !inline ? item.id : null;
  const [loaded, setLoaded] = useState<Thumbnail | null>(null);

  useEffect(() => {
    if (!id || cachedThumbnail(id) !== null) return;
    let cancelled = false;
    void loadThumbnail(id, readClipboardThumbnail)
      .then((url) => { if (!cancelled) setLoaded({ id, url, failed: false }); })
      .catch(() => { if (!cancelled) setLoaded({ id, url: null, failed: true }); });
    return () => { cancelled = true; };
  }, [id]);

  if (inline) return { url: inline, failed: false };
  if (!id) return { url: null, failed: false };
  const current = loaded?.id === id ? loaded : null;
  return { url: cachedThumbnail(id) ?? current?.url ?? null, failed: current?.failed ?? false };
}
