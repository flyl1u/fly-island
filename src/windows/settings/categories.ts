/** Pages of the settings window, in sidebar order. */
export const SETTINGS_CATEGORIES = [
  "general",
  "appearance",
  "shortcuts",
  "updates",
  "todos",
  "music",
  "translation",
  "clipboard",
  "shelf",
  "agents",
  "qq",
  "wechat",
  "mail",
  "plugins",
  "market",
  "about",
] as const;

export type SettingsCategory = (typeof SETTINGS_CATEGORIES)[number];

export type SettingsGroup = "basics" | "features" | "messages" | "extensions";

/**
 * Sidebar sections: app-wide settings, one page per module, one page per message
 * source, then installed plugins and the market. A null label leaves About on its own at the end.
 */
export const SETTINGS_GROUPS: readonly { label: SettingsGroup | null; categories: readonly SettingsCategory[] }[] = [
  { label: "basics", categories: ["general", "appearance", "shortcuts", "updates"] },
  { label: "features", categories: ["todos", "music", "translation", "clipboard", "shelf", "agents"] },
  { label: "messages", categories: ["qq", "wechat", "mail"] },
  { label: "extensions", categories: ["plugins", "market"] },
  { label: null, categories: ["about"] },
];

export const DEFAULT_SETTINGS_CATEGORY: SettingsCategory = "general";
