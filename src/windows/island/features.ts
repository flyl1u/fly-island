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
};

const PAGE_ORDER: IslandPage[] = ["todo", "music", "clipboard", "shelf", "qq"];
const SOURCE_ORDER: MessageSource[] = ["qq", "wechat", "qqMail"];

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
