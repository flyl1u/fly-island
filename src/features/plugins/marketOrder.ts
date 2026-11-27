// The order of the plugin market's cards.

/**
 * Installed cards first, the rest after, each group in catalog order. A card whose install or
 * removal is running stays at the place it was shown in (`shown`, the ids as last drawn), so the
 * cancel button does not jump away under the pointer; it takes its new place once the job ends.
 */
export function orderMarketCards<T extends { id: string }>(
  cards: readonly T[],
  isInstalled: (id: T["id"]) => boolean,
  activeIds: ReadonlySet<string>,
  shown: readonly string[] = [],
): T[] {
  const held = new Map<number, T>();
  for (const card of cards) {
    const place = activeIds.has(card.id) ? shown.indexOf(card.id) : -1;
    if (place >= 0 && place < cards.length) held.set(place, card);
  }
  const kept = new Set(held.values());
  const moving = [...cards.filter((card) => isInstalled(card.id)), ...cards.filter((card) => !isInstalled(card.id))]
    .filter((card) => !kept.has(card));
  let next = 0;
  return cards.map((_, place) => held.get(place) ?? moving[next++]);
}
