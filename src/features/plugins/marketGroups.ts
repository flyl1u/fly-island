import type { MarketPlugin } from "./api.ts";
import { isNewerVersion } from "./version.ts";

/** Categories with their own icon colour (MARKET_CATEGORIES in api.ts); others get one from their id. */
const TONES = ["productivity", "todos", "developer", "media", "messages", "information", "utilities"] as const;
export type MarketIconTone = (typeof TONES)[number];

export const hasUpdate = (plugin: Pick<MarketPlugin, "installedVersion" | "version">) =>
  plugin.installedVersion !== null && isNewerVersion(plugin.version, plugin.installedVersion);

/**
 * The market page's two groups: plugins that can be installed, then those that
 * are installed, the ones with an update first. Order inside a group is kept.
 */
export function groupMarketPlugins<T extends Pick<MarketPlugin, "installedVersion" | "version">>(plugins: readonly T[]) {
  const installable = plugins.filter((plugin) => plugin.installedVersion === null);
  const installed = plugins.filter((plugin) => plugin.installedVersion !== null);
  return { installable, installed: [...installed.filter(hasUpdate), ...installed.filter((plugin) => !hasUpdate(plugin))] };
}

/** The letter on a plugin's generated icon: the first letter or character of its name, upper case. */
export function pluginInitial(name: string) {
  const trimmed = name.replace(/^[\s"'“‘「（(【[]+/u, "");
  const first = [...trimmed][0] ?? "?";
  return first.toLocaleUpperCase();
}

/** The icon colour: its first known category, else one picked from its id so it stays the same. */
export function pluginIconTone(plugin: Pick<MarketPlugin, "id" | "categories">): MarketIconTone {
  const category = plugin.categories.find((name): name is MarketIconTone => (TONES as readonly string[]).includes(name));
  if (category) return category;
  let hash = 0;
  for (const char of plugin.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}
