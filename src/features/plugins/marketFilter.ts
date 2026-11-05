import type { MarketPlugin } from "./api";

export type MarketFilter = {
  /** Matched against both languages of the name and description, the id and the publisher. */
  query: string;
  /** A category name, or "" for all. */
  category: string;
};

/** The market plugins that match the search text and category, in index order. */
export function filterMarketPlugins(plugins: MarketPlugin[], filter: MarketFilter, officialPublisher: string): MarketPlugin[] {
  const words = filter.query.toLowerCase().split(/\s+/).filter(Boolean);
  return plugins.filter((plugin) => {
    if (filter.category && !plugin.categories.includes(filter.category)) return false;
    if (words.length === 0) return true;
    const text = [
      plugin.id,
      plugin.name["zh-CN"],
      plugin.name.en,
      plugin.description?.["zh-CN"] ?? "",
      plugin.description?.en ?? "",
      plugin.publisher || officialPublisher,
      plugin.author,
    ]
      .join("\n")
      .toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/** The categories used by at least one plugin, in the given order. */
export function usedCategories<T extends string>(plugins: MarketPlugin[], order: readonly T[]): T[] {
  return order.filter((category) => plugins.some((plugin) => plugin.categories.includes(category)));
}

/** "owner/name" as a GitHub link, or null when it is not one. */
export function repositoryUrl(repo: string | null): string | null {
  return repo && /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/.test(repo) ? `https://github.com/${repo}` : null;
}
