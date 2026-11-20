// Plugins built into the island's own source. Installing one switches on a feature that lives
// beside the original ones (a message source, an Agent provider, a collapsed status); nothing else changes until then.

export type NativePluginId = "dingtalk" | "feishu" | "wecom" | "cursor" | "kimiCode" | "zcode" | "hermes" | "clockWeather";

/** Where an installed plugin shows up: the Messages page, the Agent page or the collapsed island. */
export type NativePluginKind = "messages" | "agent" | "island";

export type PluginAuthor = { name: string; url: string };

const FLYLIU: PluginAuthor = { name: "flyliu", url: "https://github.com/flyl1u" };

export type NativePlugin = {
  id: NativePluginId;
  kind: NativePluginKind;
  /** Accent used behind the card's icon glow; a brand colour or a neutral feature colour. */
  accent: string;
  /** Who wrote it: the card shows the name and links to the page. Plugins merged from others carry their own. */
  author: PluginAuthor;
  /** Settings destination declared by an island plugin; standalone pages appear only while installed. */
  settings?: { category: string; standalone?: boolean };
};

export const NATIVE_PLUGINS: readonly NativePlugin[] = [
  { id: "dingtalk", kind: "messages", accent: "#0089ff", author: FLYLIU },
  { id: "feishu", kind: "messages", accent: "#3370ff", author: FLYLIU },
  { id: "wecom", kind: "messages", accent: "#0082f0", author: FLYLIU },
  { id: "cursor", kind: "agent", accent: "#c9c7c0", author: FLYLIU },
  { id: "kimiCode", kind: "agent", accent: "#8a8a8a", author: FLYLIU },
  { id: "zcode", kind: "agent", accent: "#7c8592", author: FLYLIU },
  { id: "hermes", kind: "agent", accent: "#b9a6ff", author: FLYLIU },
  { id: "clockWeather", kind: "island", accent: "#63b9b6", author: FLYLIU, settings: { category: "clockWeather", standalone: true } },
];

export const NATIVE_PLUGIN_IDS: readonly NativePluginId[] = NATIVE_PLUGINS.map((plugin) => plugin.id);

export function isNativePluginId(value: unknown): value is NativePluginId {
  return typeof value === "string" && (NATIVE_PLUGIN_IDS as readonly string[]).includes(value);
}
