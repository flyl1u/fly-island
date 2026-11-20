import { readString, writeString } from "../../lib/storage.ts";
import type { IslandPage } from "./types";

/** The page the island had open when it was last used; a click on the collapsed text reopens it. */
export const LAST_PAGE_KEY = "fly-island-last-page";

// Clipboard and settings open in their own windows when detached, so they are not remembered.
const REMEMBERED_PAGES: readonly IslandPage[] = ["todo", "music", "shelf", "qq", "agents", "translation"];

export function normalizeLastPage(value: unknown): IslandPage {
  return REMEMBERED_PAGES.find((page) => page === value) ?? "todo";
}

export function loadLastPage(): IslandPage {
  return normalizeLastPage(readString(LAST_PAGE_KEY));
}

export function saveLastPage(page: IslandPage) {
  if (REMEMBERED_PAGES.includes(page)) writeString(LAST_PAGE_KEY, page);
}
