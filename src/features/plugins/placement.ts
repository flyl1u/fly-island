// Where each plugin's settings live, taken from the catalog's declarations. Pure: the node tests load it.
// Rules: docs/design/settings.md, "插件设置归类规范（长期）".
import {
  NATIVE_PLUGINS, PACKAGED_MARKET_PLUGINS,
  type NativePluginId, type PluginSettingsPlacement, type PluginSettingsPlacementName,
} from "./native/catalog.ts";
import type { InstalledPlugin, PluginManifest } from "./api";

/** The settings page a placement leads to. */
export type PluginPageCategory = "agents" | "agentConnect" | "messages" | "clockWeather" | "devices" | "battery" | "music" | "centeredClock" | "screenshot" | `plugin:${string}`;

export type PlacedPlugin = {
  id: string;
  /** The page with the plugin's settings. */
  category: PluginPageCategory;
  /** The page with its action buttons; the same one unless the catalog says otherwise. */
  actionsCategory: PluginPageCategory;
  /** A sidebar entry of its own rather than a group on a shared page. */
  standalone: boolean;
} & ({ native: NativePluginId; external?: undefined } | { native?: undefined; external: InstalledPlugin });

/** A plugin the catalog does not know (loaded in developer mode) goes by what its manifest contributes. */
export function fallbackPlacement(manifest: Pick<PluginManifest, "contributes">): PluginSettingsPlacement {
  const contributes = (name: string) => manifest.contributes.includes(name);
  if (contributes("quota") || contributes("sessions")) return { placement: "agentSessions" };
  if (contributes("notifications")) return { placement: "messages" };
  return { placement: "standalone" };
}

/** A packaged plugin's declaration; null when it declared that it has nothing to set. */
export function externalPlacement(id: string, manifest: Pick<PluginManifest, "contributes">): PluginSettingsPlacement | null {
  const listed = PACKAGED_MARKET_PLUGINS.find((plugin) => plugin.id === id);
  return listed ? listed.settings : fallbackPlacement(manifest);
}

function pageFor(id: string, placement: PluginSettingsPlacementName, settings: PluginSettingsPlacement): PluginPageCategory {
  if (placement === "agentSessions") return "agents";
  if (placement === "agentConnect") return "agentConnect";
  if (placement === "messages") return "messages";
  if (placement === "music") return "music";
  return settings.category ?? `plugin:${id}`;
}

function destinations(id: string, settings: PluginSettingsPlacement) {
  return {
    id,
    category: pageFor(id, settings.placement, settings),
    actionsCategory: pageFor(id, settings.actionsPlacement ?? settings.placement, settings),
    standalone: settings.placement === "standalone",
  };
}

/**
 * Every plugin that is installed, switched on and has settings, in catalog order (built-in ones,
 * then packaged ones, then those loaded in developer mode).
 */
export function placedPlugins(
  enabledNative: Readonly<Record<NativePluginId, boolean>>,
  installed: Readonly<Record<string, InstalledPlugin>>,
): PlacedPlugin[] {
  const placed: PlacedPlugin[] = NATIVE_PLUGINS.flatMap((plugin) => plugin.settings && enabledNative[plugin.id]
    ? [{ ...destinations(plugin.id, plugin.settings), native: plugin.id }]
    : []);
  const listed: readonly string[] = PACKAGED_MARKET_PLUGINS.map((plugin) => plugin.id);
  const ids = [...listed, ...Object.keys(installed).filter((id) => !listed.includes(id)).sort()];
  for (const id of ids) {
    const external = installed[id];
    if (!external?.enabled) continue;
    const settings = externalPlacement(id, external.manifest);
    if (settings) placed.push({ ...destinations(id, settings), external });
  }
  return placed;
}

/** The plugins with something on a page: their settings, their actions or both. */
export function pluginsOnPage(placed: readonly PlacedPlugin[], category: string) {
  return placed.filter((plugin) => plugin.category === category || plugin.actionsCategory === category);
}

/** Sidebar entries to add at the end of Features, one per standalone plugin. */
export function standalonePages(placed: readonly PlacedPlugin[]) {
  return placed.filter((plugin) => plugin.standalone);
}

const named = (settings: PluginSettingsPlacement | null, category: string) => settings?.category === category;

/** Whether a built-in plugin owns this page; its state is known as soon as the window opens. */
export function isNativePluginPage(category: string) {
  return NATIVE_PLUGINS.some((plugin) => named(plugin.settings, category));
}

/** Whether a page exists only for a plugin, so it disappears with it. */
export function isPluginPage(category: string) {
  return category.startsWith("plugin:") || isNativePluginPage(category)
    || PACKAGED_MARKET_PLUGINS.some((plugin) => named(plugin.settings, category));
}
