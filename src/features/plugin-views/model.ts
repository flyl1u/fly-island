import { isViewIconName, type ViewIconName } from "./iconNames.ts";

/**
 * Plugin data for the island's view templates. Everything a plugin sends is
 * `unknown` until it passes through here: wrong types are dropped, texts are
 * cut to their limits and picked for the island's language, links must be
 * https. Pure, so tests cover it; the templates only draw what comes out.
 */

export type ViewLocale = "zh-CN" | "en";

const PAGE_PREFIX = "plugin:";

/** The island page id of a plugin view: `plugin:<plugin id>/<view id>`. */
export function pluginPageId(pluginId: string, viewId: string) {
  return `${PAGE_PREFIX}${pluginId}/${viewId}` as const;
}

export function parsePluginPageId(page: string): { pluginId: string; viewId: string } | null {
  if (!page.startsWith(PAGE_PREFIX)) return null;
  const rest = page.slice(PAGE_PREFIX.length);
  const slash = rest.lastIndexOf("/");
  if (slash <= 0 || slash === rest.length - 1) return null;
  return { pluginId: rest.slice(0, slash), viewId: rest.slice(slash + 1) };
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** A plain string, or `{ "zh-CN", "en" }` picked for `locale` (falling back to the other). */
export function readText(value: unknown, locale: ViewLocale, max: number): string | null {
  let text: unknown = value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const localized = value as Record<string, unknown>;
    const other = locale === "en" ? "zh-CN" : "en";
    text = typeof localized[locale] === "string" && localized[locale] ? localized[locale] : localized[other];
  }
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const characters = Array.from(trimmed);
  return characters.length > max ? `${characters.slice(0, max - 1).join("")}…` : trimmed;
}

/** Ids of items and actions: same rule as views::is_action_id in Rust. */
export function readId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9\-_.:/]{1,128}$/.test(value) ? value : null;
}

export function readIcon(value: unknown): ViewIconName | null {
  return isViewIconName(value) ? value : null;
}

/** An https link, or null. */
export function readLink(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("https://") || value.length > 2000) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

export type ViewAction = { id: string; title: string; icon: ViewIconName | null };

/** At most `max` actions with an id and a title. */
export function readActions(value: unknown, locale: ViewLocale, max: number): ViewAction[] {
  if (!Array.isArray(value)) return [];
  const actions: ViewAction[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    const id = readId(record.id);
    const title = readText(record.title, locale, 24);
    if (id && title && !actions.some((action) => action.id === id)) actions.push({ id, title, icon: readIcon(record.icon) });
    if (actions.length >= max) break;
  }
  return actions;
}

export type ListItem = {
  id: string;
  title: string;
  subtitle: string | null;
  note: string | null;
  icon: ViewIconName | null;
  /** Null: no check box. */
  checked: boolean | null;
  /** Opened in the browser on click. */
  url: string | null;
  /** Sent as view.action on click when there is no url. */
  action: string | null;
  actions: ViewAction[];
};

export type ListGroup = { key: string; title: string | null; items: ListItem[] };

export type ListModel = {
  groups: ListGroup[];
  empty: string | null;
  loading: boolean;
  error: string | null;
  /** Null: no search box. "local" filters here; "remote" sends view.search. */
  search: { placeholder: string | null; mode: "local" | "remote" } | null;
};

export const MAX_LIST_ITEMS = 500;
const MAX_ITEM_ACTIONS = 3;

function readItem(value: unknown, locale: ViewLocale): ListItem | null {
  const record = asRecord(value);
  const id = readId(record.id);
  const title = readText(record.title, locale, 300);
  if (!id || !title) return null;
  return {
    id,
    title,
    subtitle: readText(record.subtitle, locale, 300),
    note: readText(record.note, locale, 40),
    icon: readIcon(record.icon),
    checked: typeof record.checked === "boolean" ? record.checked : null,
    url: readLink(record.url),
    action: readId(record.action),
    actions: readActions(record.actions, locale, MAX_ITEM_ACTIONS),
  };
}

/** `{ items?, groups?: [{ title?, items }], empty?, loading?, error?, search? }`. */
export function normalizeListModel(value: unknown, locale: ViewLocale): ListModel {
  const record = asRecord(value);
  const seen = new Set<string>();
  let count = 0;
  const readItems = (list: unknown): ListItem[] => {
    if (!Array.isArray(list)) return [];
    const items: ListItem[] = [];
    for (const entry of list) {
      if (count >= MAX_LIST_ITEMS) break;
      const item = readItem(entry, locale);
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
      count += 1;
    }
    return items;
  };
  const groups: ListGroup[] = [];
  const loose = readItems(record.items);
  if (loose.length > 0) groups.push({ key: "items", title: null, items: loose });
  if (Array.isArray(record.groups)) {
    record.groups.forEach((group, index) => {
      const groupRecord = asRecord(group);
      const items = readItems(groupRecord.items);
      if (items.length > 0) groups.push({ key: `group-${index}`, title: readText(groupRecord.title, locale, 60), items });
    });
  }
  const search = asRecord(record.search);
  return {
    groups,
    empty: readText(record.empty, locale, 200),
    loading: record.loading === true,
    error: readText(record.error, locale, 300),
    search: record.search
      ? { placeholder: readText(search.placeholder, locale, 60), mode: search.mode === "remote" ? "remote" : "local" }
      : null,
  };
}

/** The groups with only the items whose texts contain `query` (any case). */
export function filterListGroups(groups: ListGroup[], query: string): ListGroup[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return groups;
  const matches = (item: ListItem) =>
    [item.title, item.subtitle, item.note].some((text) => text?.toLocaleLowerCase().includes(needle));
  return groups
    .map((group) => ({ ...group, items: group.items.filter(matches) }))
    .filter((group) => group.items.length > 0);
}

/** Rows the list takes, for the island's height: items plus group titles. */
export function listRowCount(groups: ListGroup[]): number {
  return groups.reduce((rows, group) => rows + group.items.length + (group.title ? 1 : 0), 0);
}
