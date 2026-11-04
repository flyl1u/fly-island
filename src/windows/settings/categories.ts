/** Pages of the settings window, in sidebar order. */
export const SETTINGS_CATEGORIES = [
  "general",
  "appearance",
  "todos",
  "music",
  "notifications",
  "translation",
  "clipboard",
  "shelf",
  "agents",
  "plugins",
  "market",
  "about",
] as const;

export type SettingsCategory = (typeof SETTINGS_CATEGORIES)[number];

export type SettingsGroup = "basics" | "features" | "extensions";

/**
 * Sidebar sections: app-wide settings, one page per module, then installed plugins
 * and the market. A null label leaves About on its own at the end.
 */
export const SETTINGS_GROUPS: readonly { label: SettingsGroup | null; categories: readonly SettingsCategory[] }[] = [
  { label: "basics", categories: ["general", "appearance"] },
  { label: "features", categories: ["todos", "music", "notifications", "translation", "clipboard", "shelf", "agents"] },
  { label: "extensions", categories: ["plugins", "market"] },
  { label: null, categories: ["about"] },
];

export const DEFAULT_SETTINGS_CATEGORY: SettingsCategory = "general";
