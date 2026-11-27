/** Decoded, local blob URLs survive market remounts; requests are shared across author rows. */
const avatars = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();
const MAX_BYTES = 128 * 1024;

export function githubAvatarUrl(url: string): string | null {
  const login = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/?$/.exec(url)?.[1];
  return login ? `https://avatars.githubusercontent.com/${login}?s=64` : null;
}

export function cachedAuthorAvatar(source: string): string | undefined {
  return avatars.get(source);
}

export function loadAuthorAvatar(source: string): Promise<string | null> {
  const cached = avatars.get(source);
  if (cached) return Promise.resolve(cached);
  const existing = pending.get(source);
  if (existing) return existing;
  const request = fetch(source, { cache: "force-cache", credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(10_000) })
    .then(async (response) => {
      if (!response.ok) return null;
      const blob = await response.blob();
      if (!blob.type.startsWith("image/") || blob.size > MAX_BYTES) return null;
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.src = url;
      try { await image.decode(); }
      catch { URL.revokeObjectURL(url); return null; }
      avatars.set(source, url);
      return url;
    })
    .catch(() => null)
    .finally(() => pending.delete(source));
  pending.set(source, request);
  return request;
}
