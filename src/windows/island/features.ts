import type { MessageSource } from "../../features/messages/messagePreview";
import type { IslandPage } from "./types";

/** Which modules are switched on; an off module is hidden on the island. */
export type IslandFeatures = {
  todo: boolean;
  music: boolean;
  clipboard: boolean;
  shelf: boolean;
  qq: boolean;
  wechat: boolean;
  qqMail: boolean;
  /** The AI Agent switch; off hides the Agent page. */
  agents: boolean;
};

const PAGE_ORDER: IslandPage[] = ["todo", "music", "clipboard", "shelf", "qq", "agents"];
const SOURCE_ORDER: MessageSource[] = ["qq", "wechat", "qqMail"];
// Header controls from left to right. Alt+1 is the first one that is switched on.
const SHORTCUT_ORDER: IslandPage[] = ["agents", "todo", "music", "clipboard", "shelf", "qq"];

export function isPageEnabled(page: IslandPage, features: IslandFeatures) {
  return page === "qq" ? features.qq || features.wechat || features.qqMail : features[page];
}

/** `page` when it is on, otherwise the first page that is, or null when every page is off. */
export function resolveIslandPage(page: IslandPage, features: IslandFeatures): IslandPage | null {
  if (isPageEnabled(page, features)) return page;
  return PAGE_ORDER.find((candidate) => isPageEnabled(candidate, features)) ?? null;
}

/** `source` when it is on, otherwise the first message source that is (or `source` if none). */
export function resolveMessageSource(source: MessageSource, features: IslandFeatures): MessageSource {
  if (features[source]) return source;
  return SOURCE_ORDER.find((candidate) => features[candidate]) ?? source;
}

/** Pages a focused, expanded island switches with Alt+1, Alt+2, … Off modules leave no gap. */
export function pageShortcutOrder(features: IslandFeatures): IslandPage[] {
  return SHORTCUT_ORDER.filter((page) => isPageEnabled(page, features));
}

/** The page Alt+`digit` opens, or null when that number is past the last visible page. */
export function pageForAltDigit(features: IslandFeatures, digit: number): IslandPage | null {
  if (!Number.isInteger(digit) || digit < 1 || digit > 9) return null;
  return pageShortcutOrder(features)[digit - 1] ?? null;
}

export function pageShortcutLabel(features: IslandFeatures, page: IslandPage, modifiers: string): string | null {
  const index = pageShortcutOrder(features).indexOf(page);
  return index < 0 ? null : `${modifiers}+${index + 1}`;
}

/** The next or previous visible page, wrapping around. Null when there is nowhere to move. */
export function cycleShortcutPage(features: IslandFeatures, page: IslandPage, direction: 1 | -1): IslandPage | null {
  const order = pageShortcutOrder(features);
  if (order.length < 2) return null;
  const index = order.indexOf(page);
  const start = index < 0 ? (direction > 0 ? -1 : 0) : index;
  const target = order[(start + direction + order.length) % order.length];
  return target === page ? null : target;
}
