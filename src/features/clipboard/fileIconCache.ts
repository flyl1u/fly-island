/**
 * File entries' Explorer icons read on demand (read_clipboard_history_file_icon), kept for the rows
 * scrolled past. `null` is an answer too (the file is gone): it is kept so the row does not ask
 * again. Icons are a few KB each and are never written to the history file.
 */
const LIMIT = 300;
const cache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

export function cachedFileIcon(id: string): string | null | undefined {
  const url = cache.get(id);
  if (url === undefined) return undefined;
  // Most recently used last, so the oldest is the first one dropped.
  cache.delete(id);
  cache.set(id, url);
  return url;
}

export function loadFileIcon(id: string, read: (id: string) => Promise<string | null>): Promise<string | null> {
  const known = cachedFileIcon(id);
  if (known !== undefined) return Promise.resolve(known);
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
