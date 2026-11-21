// Plugins built into the island's own source. Installing one switches on a feature that lives
// beside the original ones (a message source, an Agent provider, a collapsed status); nothing else changes until then.

export type NativePluginId = "dingtalk" | "feishu" | "wecom" | "cursor" | "kimiCode" | "zcode" | "hermes" | "clockWeather" | "minimaxCode";

/** Where an installed plugin shows up: the Messages page, the Agent page or the collapsed island. */
export type NativePluginKind = "messages" | "agent" | "island";

export type NativePlugin = {
  id: NativePluginId;
  kind: NativePluginKind;
  /** Accent used behind the card's icon glow; a brand colour or a neutral feature colour. */
  accent: string;
};

export const NATIVE_PLUGINS: readonly NativePlugin[] = [
  { id: "dingtalk", kind: "messages", accent: "#0089ff" },
  { id: "feishu", kind: "messages", accent: "#3370ff" },
  { id: "wecom", kind: "messages", accent: "#0082f0" },
  { id: "cursor", kind: "agent", accent: "#c9c7c0" },
  { id: "kimiCode", kind: "agent", accent: "#8a8a8a" },
  { id: "zcode", kind: "agent", accent: "#7c8592" },
  { id: "hermes", kind: "agent", accent: "#b9a6ff" },
  { id: "clockWeather", kind: "island", accent: "#63b9b6" },
  { id: "minimaxCode", kind: "agent", accent: "#0f9ef0" },
];

export const NATIVE_PLUGIN_IDS: readonly NativePluginId[] = NATIVE_PLUGINS.map((plugin) => plugin.id);

export function isNativePluginId(value: unknown): value is NativePluginId {
  return typeof value === "string" && (NATIVE_PLUGIN_IDS as readonly string[]).includes(value);
}