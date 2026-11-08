// Searching the settings window for single settings, not only pages. The rows come from
// searchIndex.json, which `pnpm settings:index` writes from the pages themselves (both languages);
// the settings-search regression page fails when a page shows a row the index lacks. Pure.

import type { LocaleCode } from "../../i18n";
import type { SettingsCategory } from "./categories";

/** One row as one language shows it. */
export type SettingsRowText = {
  /** The title of the group the row is in; empty when the group has none. */
  group: string;
  title: string;
  description?: string;
  /** The choices of its menu or segmented control. */
  options?: string[];
};

export type SettingsSearchEntry = { page: SettingsCategory } & Record<LocaleCode, SettingsRowText>;

export type SettingsRowHit = {
  page: SettingsCategory;
  /** The row's texts in the language asked for; its title finds the row on the page. */
  text: SettingsRowText;
  score: number;
};

/** What a word matched, best first: a title, a choice, a description. */
const TITLE = 3;
const OPTION = 2;
const DESCRIPTION = 1;
/** A row's hits under its page in the sidebar; the rest is left out. */
export const MAX_HITS_PER_PAGE = 5;

/**
 * Text as the search compares it: NFKC (full-width letters become plain ones), lower case, and
 * without spaces and punctuation, so 「弹出提醒」 finds 「弹出 提醒」 and "auto-tuck" finds "autotuck".
 */
export function normalizeSearchText(text: string) {
  return text.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

/** The query's words, each normalized; empty words dropped. */
export function searchWords(query: string) {
  return query.split(/\s+/).map(normalizeSearchText).filter(Boolean);
}

/** How well `word` matches the row in any language: 0 when it does not. */
function wordScore(word: string, entry: SettingsSearchEntry, locales: readonly LocaleCode[]) {
  let best = 0;
  for (const locale of locales) {
    const text = entry[locale];
    if (normalizeSearchText(text.title).includes(word)) return TITLE;
    if (text.options?.some((option) => normalizeSearchText(option).includes(word))) best = Math.max(best, OPTION);
    if (text.description && normalizeSearchText(text.description).includes(word)) best = Math.max(best, DESCRIPTION);
  }
  return best;
}

/**
 * The rows the query finds, best first (in index order when equal), with `locale`'s texts.
 * Every word must appear in the row (title, description or a choice, in any language) or in its
 * page's own text (`pageText`: name, group and keywords); at least one in the row itself, so a
 * page's name alone does not list all its rows.
 */
export function searchSettingsRows(
  query: string,
  entries: readonly SettingsSearchEntry[],
  locale: LocaleCode,
  locales: readonly LocaleCode[],
  pageText: (page: SettingsCategory) => string,
): SettingsRowHit[] {
  const words = searchWords(query);
  if (words.length === 0) return [];
  const pages = new Map<SettingsCategory, string>();
  const hits: SettingsRowHit[] = [];
  for (const entry of entries) {
    let page = pages.get(entry.page);
    if (page === undefined) pages.set(entry.page, (page = normalizeSearchText(pageText(entry.page))));
    let score = 0;
    let inRow = false;
    let all = true;
    for (const word of words) {
      const found = wordScore(word, entry, locales);
      if (found > 0) {
        score += found;
        inRow = true;
      } else if (!page.includes(word)) {
        all = false;
        break;
      }
    }
    if (all && inRow) hits.push({ page: entry.page, text: entry[locale], score });
  }
  // Array.prototype.sort is stable, so equal scores keep the index's (page) order.
  return hits.sort((a, b) => b.score - a.score);
}

/** Whether the best hit is the query in a row's title, so Enter should open that row, not a page. */
export function isTitleHit(hit: SettingsRowHit | undefined, query: string) {
  return hit !== undefined && hit.score >= searchWords(query).length * TITLE;
}
