// lucide icon names plugin views and items may use. Same list as VIEW_ICONS in
// src-tauri/src/plugin_host/view_specs.rs and the manifest schema (checked by tests).
export const VIEW_ICON_NAMES = [
  "list", "list-checks", "list-todo", "kanban", "square-check", "timer", "clock", "calendar", "bell", "book-open",
  "bookmark", "star", "heart", "folder", "file-text", "git-pull-request", "bug", "code", "terminal", "cloud", "sun",
  "music", "newspaper", "rss", "mail", "message-square", "globe", "link", "activity", "chart-column", "zap", "flame",
  "coffee", "puzzle", "gauge", "target", "trophy", "rocket", "sparkles", "inbox", "tag", "hash", "search", "house",
  "notebook", "circle-check", "info",
] as const;

export type ViewIconName = (typeof VIEW_ICON_NAMES)[number];

export function isViewIconName(value: unknown): value is ViewIconName {
  return typeof value === "string" && (VIEW_ICON_NAMES as readonly string[]).includes(value);
}
