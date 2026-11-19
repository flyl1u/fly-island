import type { PageDot } from "../../features/appearance/types";
import { isPageEnabled, type IslandFeatures } from "./features.ts";
import type { IslandPage } from "./types";

/**
 * The pages Ctrl + wheel steps through, in the header's order: the Agent page, the page dots
 * (translation only while it opens inside the island, a detached clipboard not at all, since
 * both open a window of their own), installed plugin pages, then messages.
 */
export function wheelPageOrder(pageOrder: PageDot[], features: IslandFeatures, clipboardDetached: boolean): IslandPage[] {
  const pages: IslandPage[] = [];
  if (features.agents) pages.push("agents");
  for (const dot of pageOrder) {
    if (dot === "clipboard" && clipboardDetached) continue;
    if (features[dot]) pages.push(dot);
  }
  pages.push(...features.pluginPages.map((info) => info.page));
  if (isPageEnabled("qq", features)) pages.push("qq");
  return pages;
}

/** The page `direction` (1 down, -1 up) steps from `page` to, round the ends; null with nowhere to go. */
export function nextWheelPage(pages: IslandPage[], page: IslandPage, direction: 1 | -1): IslandPage | null {
  if (pages.length === 0) return null;
  const index = pages.indexOf(page);
  if (index < 0) return pages[direction > 0 ? 0 : pages.length - 1];
  const next = pages[(index + direction + pages.length) % pages.length];
  return next === page ? null : next;
}
