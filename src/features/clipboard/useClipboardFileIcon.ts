import { useEffect, useState } from "react";
import { readClipboardFileIcon, type ClipboardHistoryItem } from "./api";
import { cachedFileIcon, loadFileIcon } from "./fileIconCache";
import { clipboardItemKind } from "./kind";

/**
 * A file row's system icon, asked for once the row is mounted (the list mounts rows in batches as it
 * scrolls) and then cached. Null while loading, outside Windows, or when the file is gone: the row
 * then shows its generic icon.
 */
export function useClipboardFileIcon(item: ClipboardHistoryItem): string | null {
  const id = clipboardItemKind(item) === "file" ? item.id : null;
  const [loaded, setLoaded] = useState<{ id: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!id || cachedFileIcon(id) !== undefined) return;
    let cancelled = false;
    // The generic icon stays on any failure.
    loadFileIcon(id, readClipboardFileIcon)
      .then((url) => { if (!cancelled) setLoaded({ id, url }); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [id]);

  if (!id) return null;
  return cachedFileIcon(id) ?? (loaded?.id === id ? loaded.url : null);
}
