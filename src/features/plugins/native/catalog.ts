// Plugins built into the island's own source. Installing one switches on a feature that lives
// beside the original ones (a message source, an Agent provider, a collapsed status); nothing else changes until then.

import marketPackageIds from "../../../../plugins/market-packages.json" with { type: "json" };

export type NativePluginId = "dingtalk" | "feishu" | "wecom" | "telegram" | "cursor" | "kimiCode" | "codebuddy" | "antigravity" | "zcode" | "hermes" | "relay" | "clockWeather" | "calendarMarks" | "battery";

/** Where an installed plugin shows up: the Messages page, the Agent page or the collapsed island. */
export type NativePluginKind = "messages" | "agent" | "island";

export type PluginAuthor = { name: string; url: string };

const FLYLIU: PluginAuthor = { name: "flyliu", url: "https://github.com/flyl1u" };
const OWN: readonly PluginAuthor[] = [FLYLIU];

/** Someone else's plugin: its contributor first, then flyliu, who helped it land and fixed it. */
function contributed(login: string, name = login): readonly PluginAuthor[] {
  return [{ name, url: `https://github.com/${login}` }, FLYLIU];
}

/** The kind of settings page a plugin belongs on. Rules: docs/design/settings.md, "插件设置归类规范（长期）". */
export type PluginSettingsPlacementName = "standalone" | "agentSessions" | "agentConnect" | "messages";

export type PluginSettingsPlacement = {
  placement: PluginSettingsPlacementName;
  /** Standalone only: an existing page name to keep, instead of `plugin:<id>`. */
  category?: "clockWeather" | "devices" | "battery";
  /** Where the action buttons go when they belong on another page than the settings. */
  actionsPlacement?: PluginSettingsPlacementName;
};

export type NativePlugin = {
  id: NativePluginId;
  kind: NativePluginKind;
  /** Accent used behind the card's icon glow; a brand colour or a neutral feature colour. */
  accent: string;
  /** Who wrote it, in the order the card shows them: avatar and name, linking to each page. */
  authors: readonly PluginAuthor[];
  /** Where its settings show up while it is installed and on; null when it has none. Required. */
  settings: PluginSettingsPlacement | null;
};

const MESSAGES = { placement: "messages" } as const;
const AGENT_SESSIONS = { placement: "agentSessions" } as const;

export const NATIVE_PLUGINS: readonly NativePlugin[] = [
  { id: "dingtalk", kind: "messages", accent: "#0089ff", authors: OWN, settings: MESSAGES },
  { id: "feishu", kind: "messages", accent: "#3370ff", authors: OWN, settings: MESSAGES },
  { id: "wecom", kind: "messages", accent: "#0082f0", authors: OWN, settings: MESSAGES },
  { id: "telegram", kind: "messages", accent: "#2aabee", authors: contributed("baiyu0111"), settings: MESSAGES },
  { id: "cursor", kind: "agent", accent: "#c9c7c0", authors: OWN, settings: AGENT_SESSIONS },
  { id: "kimiCode", kind: "agent", accent: "#8a8a8a", authors: OWN, settings: AGENT_SESSIONS },
  { id: "codebuddy", kind: "agent", accent: "#6c4dff", authors: contributed("yiumanlenong"), settings: AGENT_SESSIONS },
  { id: "antigravity", kind: "agent", accent: "#6dc487", authors: contributed("lilipeng0615-cyber"), settings: AGENT_SESSIONS },
  { id: "zcode", kind: "agent", accent: "#7c8592", authors: OWN, settings: AGENT_SESSIONS },
  { id: "hermes", kind: "agent", accent: "#b9a6ff", authors: OWN, settings: AGENT_SESSIONS },
  { id: "relay", kind: "agent", accent: "#7cc4e8", authors: contributed("yiumanlenong"), settings: AGENT_SESSIONS },
  { id: "calendarMarks", kind: "island", accent: "#f29389", authors: contributed("gyl-coding"), settings: null },
  { id: "clockWeather", kind: "island", accent: "#63b9b6", authors: OWN, settings: { placement: "standalone", category: "clockWeather" } },
  { id: "battery", kind: "island", accent: "#8fd9a8", authors: contributed("QXiaoLingShang"), settings: { placement: "standalone", category: "battery" } },
];

export const PACKAGED_MARKET_PLUGINS = [
  // Quota and sessions sit with the other Agents; connecting the approval hooks with the other hooks.
  { id: "minimax", accent: "#0f9ef0", authors: contributed("YTC0408"),
    settings: { placement: "agentSessions", actionsPlacement: "agentConnect" } },
  { id: "device-battery", accent: "#54bbaf", authors: contributed("Anobod1119"),
    settings: { placement: "standalone", category: "devices" } },
  { id: "eye-care", accent: "#e796a8", authors: contributed("zloghs"),
    settings: { placement: "standalone" } },
] as const satisfies readonly { id: string; accent: string; authors: readonly PluginAuthor[]; settings: PluginSettingsPlacement | null }[];

export type PackagedMarketId = (typeof PACKAGED_MARKET_PLUGINS)[number]["id"];
export type MarketPluginId = NativePluginId | PackagedMarketId;

const approvedPackages = new Set(marketPackageIds);
export const MARKET_PACKAGES = PACKAGED_MARKET_PLUGINS.filter(({ id }) => approvedPackages.has(id));

export const NATIVE_PLUGIN_IDS: readonly NativePluginId[] = NATIVE_PLUGINS.map((plugin) => plugin.id);

export function isNativePluginId(value: unknown): value is NativePluginId {
  return typeof value === "string" && (NATIVE_PLUGIN_IDS as readonly string[]).includes(value);
}
