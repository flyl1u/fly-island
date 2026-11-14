/**
 * The media session the island follows: the first in the user's order (Settings → Music) that is
 * playing, else the first in that order that is open; null when none of the sessions is listed
 * (a new one is listed a moment after it is first seen).
 */
export function pickMediaSource(
  sessions: readonly { id: string; playing: boolean; aliases?: string[] }[],
  order: readonly { id: string; enabled?: boolean; aliases?: string[] }[],
): string | null {
  const excluded = new Set(order.filter((source) => source.enabled === false).flatMap((source) => [source.id, ...(source.aliases ?? [])]));
  const present = new Map(sessions.filter((session) => ![session.id, ...(session.aliases ?? [])].some((id) => excluded.has(id)))
    .flatMap((session) => [session.id, ...(session.aliases ?? [])].map((id) => [id, session] as const)));
  const eligible = order.filter((source) => source.enabled !== false);
  return eligible.map((source) => present.get(source.id)).find((session) => session?.playing)?.id
    ?? eligible.map((source) => present.get(source.id)).find(Boolean)?.id
    ?? null;
}
