/** Pages of the settings window, in sidebar order. */
export const SETTINGS_CATEGORIES = [
  "general",
  "appearance",
  "todos",
  "music",
  "translation",
  "clipboard",
  "messages",
  "agents",
  "agentConnect",
  "plugins",
  "about",
] as const;

export type SettingsCategory = (typeof SETTINGS_CATEGORIES)[number];

export type SettingsGroup = "basics" | "features" | "agents";

/**
 * Sidebar sections: app-wide settings, one page per module (QQ, WeChat and Mail share Messages,
 * the file shelf shares Clipboard), the two AI Agent pages (sessions and alerts, connection). A
 * null label sets Plugins and About apart as the last group of the list, below Connection.
 */
export const SETTINGS_GROUPS: readonly { label: SettingsGroup | null; categories: readonly SettingsCategory[] }[] = [
  { label: "basics", categories: ["general", "appearance"] },
  { label: "features", categories: ["todos", "music", "translation", "clipboard", "messages"] },
  { label: "agents", categories: ["agents", "agentConnect"] },
  { label: null, categories: ["plugins", "about"] },
];

export const DEFAULT_SETTINGS_CATEGORY: SettingsCategory = "general";

/** Pages that were merged into another, by their old name: what the island or a link still asks for. */
const MERGED_CATEGORIES: Readonly<Record<string, SettingsCategory>> = {
  qq: "messages",
  wechat: "messages",
  mail: "messages",
  updates: "about",
  shelf: "clipboard",
  agentAlerts: "agents",
  sounds: "agents",
  agentApprovals: "agents",
};

/** The page a category name opens, old names included; null when there is no such page. */
export function settingsCategoryFor(name: string): SettingsCategory | null {
  if ((SETTINGS_CATEGORIES as readonly string[]).includes(name)) return name as SettingsCategory;
  return MERGED_CATEGORIES[name] ?? null;
}
