/** Pages of the settings window, in sidebar order. */
export const SETTINGS_CATEGORIES = [
  "general",
  "appearance",
  "shortcuts",
  "todos",
  "calendar",
  "music",
  "translation",
  "clipboard",
  "shelf",
  "messages",
  "agents",
  "agentAlerts",
  "sounds",
  "agentApprovals",
  "agentConnect",
  "plugins",
  "about",
] as const;

export type SettingsCategory = (typeof SETTINGS_CATEGORIES)[number];

export type SettingsGroup = "basics" | "features" | "agents" | "extensions";

/**
 * Sidebar sections: app-wide settings, one page per module (QQ, WeChat and Mail share
 * Messages), the AI Agent pages (sessions, alerts, sounds, approvals, connection), then plugins (installed and the market on one page). A null label leaves About on its own at the end.
 */
export const SETTINGS_GROUPS: readonly { label: SettingsGroup | null; categories: readonly SettingsCategory[] }[] = [
  { label: "basics", categories: ["general", "appearance", "shortcuts"] },
  { label: "features", categories: ["todos", "calendar", "music", "translation", "clipboard", "shelf", "messages"] },
  { label: "agents", categories: ["agents", "agentAlerts", "sounds", "agentApprovals", "agentConnect"] },
  { label: "extensions", categories: ["plugins"] },
  { label: null, categories: ["about"] },
];

export const DEFAULT_SETTINGS_CATEGORY: SettingsCategory = "general";

/** Pages that were merged into another, by their old name: what the island or a link still asks for. */
const MERGED_CATEGORIES: Readonly<Record<string, SettingsCategory>> = {
  qq: "messages",
  wechat: "messages",
  mail: "messages",
  // Opens the Plugins page; SettingsWindow shows its Market tab for this name.
  market: "plugins",
  updates: "about",
};

/** The page a category name opens, old names included; null when there is no such page. */
export function settingsCategoryFor(name: string): SettingsCategory | null {
  if ((SETTINGS_CATEGORIES as readonly string[]).includes(name)) return name as SettingsCategory;
  return MERGED_CATEGORIES[name] ?? null;
}
