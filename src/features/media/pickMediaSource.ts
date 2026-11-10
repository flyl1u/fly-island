/**
 * The media session the island follows: the first in the user's order (Settings → Music) that is
 * playing, else the first in that order that is open; null when none of the sessions is listed
 * (a new one is listed a moment after it is first seen).
 */
export function pickMediaSource(
  sessions: readonly { id: string; playing: boolean }[],
  order: readonly { id: string }[],
): string | null {
  const present = new Map(sessions.map((session) => [session.id, session]));
  return order.find((source) => present.get(source.id)?.playing)?.id
    ?? order.find((source) => present.has(source.id))?.id
    ?? null;
}
