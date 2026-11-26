import { islandPanelActions } from "../../features/plugins/panelActions.ts";
import type { InstalledPlugin, Localized, PluginsSnapshot } from "../../features/plugins/api";
import { isPluginPanelIcon, type PluginPanelIcon } from "../../features/plugins/panelTypes.ts";
import type { MessageSource } from "../../features/messages/messagePreview";
import type { BuiltinPage, IslandPage, PluginPage } from "./types";
import { PLUGIN_RUNTIME_ENABLED } from "../../features/releaseFlags.ts";

/** A plugin's own page: its button in the header and the panel the page shows. */
export type PluginPageInfo = {
  page: PluginPage;
  id: string;
  name: Localized;
  icon: PluginPanelIcon;
  /** Rows and buttons the plugin reports now, so the island can size the page around them. */
  rows: number;
  actions: number;
  /** Something worth a look (a break due, a low battery): a dot on the page's button. */
  attention: boolean;
};

/** Which modules are switched on; an off module is hidden on the island. */
export type IslandFeatures = {
  todo: boolean;
  music: boolean;
  clipboard: boolean;
  shelf: boolean;
  qq: boolean;
  wechat: boolean;
  qqMail: boolean;
  plugin?: boolean;
  /** Office clients installed from the plugin market and switched on. */
  dingtalk?: boolean;
  feishu?: boolean;
  wecom?: boolean;
  /** The AI Agent switch; off hides the Agent page. */
  agents: boolean;
  /** Translation is on and set to open as an island page rather than its own window. */
  translation: boolean;
  /** Installed, enabled plugins that bring a page of their own. */
  pluginPages?: readonly PluginPageInfo[];
};

const PAGE_ORDER: BuiltinPage[] = ["todo", "music", "clipboard", "shelf", "qq", "agents", "translation"];
const SOURCE_ORDER: MessageSource[] = ["wechat", "qq", "qqMail", "dingtalk", "feishu", "wecom", "plugin"];

/** The page id of a plugin's page; the plugin id is namespaced so it can never meet a built-in. */
export function pluginPageId(id: string): PluginPage {
  return `plugin:${id}`;
}

export function isPluginPage(page: IslandPage): page is PluginPage {
  return page.startsWith("plugin:");
}

export function pluginIdOfPage(page: PluginPage): string {
  return page.slice("plugin:".length);
}

/** The pages of the plugins installed, enabled and declaring a panel, in id order. */
export function pluginPagesFrom(installed: Record<string, InstalledPlugin>, live: PluginsSnapshot["live"]): PluginPageInfo[] {
  return Object.values(installed)
    .sort((left, right) => left.manifest.id.localeCompare(right.manifest.id))
    .filter((plugin) => plugin.enabled && plugin.manifest.contributes.includes("panel") && plugin.manifest.panel)
    .map((plugin) => {
      const panel = live[plugin.manifest.id]?.panel;
      const icon = plugin.manifest.panel?.icon ?? "";
      return {
        page: pluginPageId(plugin.manifest.id),
        id: plugin.manifest.id,
        name: plugin.manifest.name,
        icon: isPluginPanelIcon(icon) ? icon : "puzzle",
        rows: panel?.rows.length ?? 0,
        actions: islandPanelActions(panel).length,
        attention: panel?.attention === true,
      };
    });
}

export function isPageEnabled(page: IslandPage, features: IslandFeatures): boolean {
  if (page === "settings") return true;
  if (isPluginPage(page)) return features.pluginPages?.some((info) => info.page === page) ?? false;
  return page === "qq"
    ? features.qq || features.wechat || features.qqMail || features.dingtalk === true || features.feishu === true || features.wecom === true
      || (PLUGIN_RUNTIME_ENABLED && features.plugin === true)
    : features[page] === true;
}

/** `page` when it is on, otherwise the first page that is, or null when every page is off. */
export function resolveIslandPage(page: IslandPage, features: IslandFeatures): IslandPage | null {
  if (isPageEnabled(page, features)) return page;
  return PAGE_ORDER.find((candidate) => isPageEnabled(candidate, features)) ?? features.pluginPages?.[0]?.page ?? null;
}

/**
 * The page the island keeps open. A clipboard opened in its own window is no island page, so a
 * remembered clipboard page moves on: otherwise every click on the island would only open that
 * window again and the island could never reach another page.
 */
export function islandPageFor(page: IslandPage, features: IslandFeatures, clipboardDetached: boolean): IslandPage | null {
  return resolveIslandPage(page, clipboardDetached ? { ...features, clipboard: false } : features);
}

/** `source` when it is on, otherwise the first message source that is (or `source` if none). */
export function resolveMessageSource(source: MessageSource, features: IslandFeatures): MessageSource {
  const enabled = (candidate: MessageSource) => (PLUGIN_RUNTIME_ENABLED || candidate !== "plugin") && features[candidate] === true;
  if (enabled(source)) return source;
  return SOURCE_ORDER.find(enabled) ?? (source === "plugin" && !PLUGIN_RUNTIME_ENABLED ? "qqMail" : source);
}
