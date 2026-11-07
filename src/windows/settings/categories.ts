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
  "agentRemote",
  "agentAlerts",
  "sounds",
  "agentApprovals",
  "agentConnect",
  "plugins",
  "market",
  "about",
] as const;

export type SettingsCategory = (typeof SETTINGS_CATEGORIES)[number];

export type SettingsGroup = "basics" | "features" | "agents" | "extensions";

/**
 * Sidebar sections: app-wide settings, one page per module (QQ, WeChat and Mail share
 * Messages), the AI Agent pages (sessions, remote computers, alerts, sounds, approvals, connection), then plugins (installed, and the market on its own page). A null label leaves About on its own at the end.
 */
export const SETTINGS_GROUPS: readonly { label: SettingsGroup | null; categories: readonly SettingsCategory[] }[] = [
  { label: "basics", categories: ["general", "appearance", "shortcuts"] },
  { label: "features", categories: ["todos", "calendar", "music", "translation", "clipboard", "shelf", "messages"] },
  { label: "agents", categories: ["agents", "agentRemote", "agentAlerts", "sounds", "agentApprovals", "agentConnect"] },
  { label: "extensions", categories: ["plugins", "market"] },
  { label: null, categories: ["about"] },
];

export const DEFAULT_SETTINGS_CATEGORY: SettingsCategory = "general";

/** Pages that were merged into another, by their old name: what the island or a link still asks for. */
const MERGED_CATEGORIES: Readonly<Record<string, SettingsCategory>> = {
  qq: "messages",
  wechat: "messages",
  mail: "messages",
  updates: "about",
};

/**
 * Pages the sidebar search finds, in sidebar order: every word of the query appears in the
 * page's text (its name, its group's name and its keywords, from `describe`), ignoring case.
 */
export function searchCategories(query: string, describe: (category: SettingsCategory) => string): SettingsCategory[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...SETTINGS_CATEGORIES];
  return SETTINGS_CATEGORIES.filter((category) => {
    const text = describe(category).toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/** The page a category name opens, old names included; null when there is no such page. */
export function settingsCategoryFor(name: string): SettingsCategory | null {
  if ((SETTINGS_CATEGORIES as readonly string[]).includes(name)) return name as SettingsCategory;
  return MERGED_CATEGORIES[name] ?? null;
}
