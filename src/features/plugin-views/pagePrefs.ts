import type { PluginViewEntry } from "./api";
import { pluginPageId } from "./model.ts";

/**
 * Which plugin pages the island shows and in what order (settings → plugins →
 * island pages). Pages are named by their page id; pages of plugins that are
 * gone stay listed, so a reinstalled plugin keeps its place.
 */
export type PluginPagePrefs = { order: string[]; hidden: string[] };

const MAX_ENTRIES = 100;

function pageIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && entry.startsWith("plugin:") && entry.length <= 200 && !ids.includes(entry)) ids.push(entry);
    if (ids.length >= MAX_ENTRIES) break;
  }
  return ids;
}

/** Anything stored falls back to "default order, nothing hidden". */
export function normalizePluginPagePrefs(value: unknown): PluginPagePrefs {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return { order: pageIds(record.order), hidden: pageIds(record.hidden) };
}

const idOf = (view: PluginViewEntry): string => pluginPageId(view.pluginId, view.viewId);

/** Every page in the user's order; pages not placed yet keep their plugin order at the end. */
export function orderPluginViews(views: readonly PluginViewEntry[], prefs: PluginPagePrefs): PluginViewEntry[] {
  const rank = (view: PluginViewEntry) => {
    const index = prefs.order.indexOf(idOf(view));
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  return views
    .map((view, index) => ({ view, index }))
    .sort((a, b) => rank(a.view) - rank(b.view) || a.index - b.index)
    .map(({ view }) => view);
}

/** The pages the island shows, in order. */
export function visiblePluginViews(views: readonly PluginViewEntry[], prefs: PluginPagePrefs): PluginViewEntry[] {
  return orderPluginViews(views, prefs).filter((view) => !prefs.hidden.includes(idOf(view)));
}

/** Moves `id` one place up (-1) or down (1) among `views`. */
export function movePluginPage(views: readonly PluginViewEntry[], prefs: PluginPagePrefs, id: string, step: -1 | 1): PluginPagePrefs {
  const ids = orderPluginViews(views, prefs).map(idOf);
  const from = ids.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= ids.length) return prefs;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  // Pages of plugins not running now keep their place after the ones shown.
  const rest = prefs.order.filter((known) => !ids.includes(known));
  return { ...prefs, order: [...ids, ...rest].slice(0, MAX_ENTRIES) };
}

export function setPluginPageHidden(prefs: PluginPagePrefs, id: string, hidden: boolean): PluginPagePrefs {
  const others = prefs.hidden.filter((known) => known !== id);
  return { ...prefs, hidden: hidden ? [...others, id].slice(0, MAX_ENTRIES) : others };
}
