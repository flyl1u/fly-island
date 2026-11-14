/**
 * Thumbnails read on demand (read_clipboard_history_thumbnail), kept for the rows scrolled past
 * so scrolling back or reopening the panel does not ask again. Thumbnails are about 10–30 KB each.
 */
const LIMIT = 300;
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

export function cachedThumbnail(id: string): string | null {
  const url = cache.get(id);
  if (url === undefined) return null;
  // Most recently used last, so the oldest is the first one dropped.
  cache.delete(id);
  cache.set(id, url);
  return url;
}

export function loadThumbnail(id: string, read: (id: string) => Promise<string>): Promise<string> {
  const known = cachedThumbnail(id);
  if (known !== null) return Promise.resolve(known);
  let request = pending.get(id);
  if (!request) {
    request = read(id)
      .then((url) => {
        cache.set(id, url);
        while (cache.size > LIMIT) cache.delete(cache.keys().next().value as string);
        return url;
      })
      .finally(() => pending.delete(id));
    pending.set(id, request);
  }
  return request;
}

export function thumbnailCacheSize() {
  return cache.size;
}
