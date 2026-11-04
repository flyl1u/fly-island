import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";

// 与 src-tauri/src/plugin_host/permissions.rs 中的 PERMISSIONS 对应。
export const PLUGIN_PERMISSIONS = [
  "todos:read",
  "todos:write",
  "notes:read",
  "notes:write",
  "agent-status:read",
  "agent-status:write",
  "island:notify",
  "secrets",
  "clipboard:read",
  "messages:read",
  "media:read",
  "media:control",
] as const;
export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number];

// 与 src-tauri/src/plugin_host/manifest.rs 中的 LocalizedText、PluginCommand 对应。
export type LocalizedText = { "zh-CN": string; en: string };
export type PluginCommand = {
  id: string;
  title: LocalizedText;
  /** A global shortcut such as "Ctrl+Alt+P" (API version 2). */
  keybinding?: string;
  /** When the shortcut runs the command; see when.ts. */
  when?: string;
};

// 与 src-tauri/src/plugin_host/manifest.rs 中的 runtime_requirement 对应：插件运行需要另外安装什么。
export type PluginRuntimeRequirement = "exe" | "powershell" | "node" | "none" | "builtin";

// 与 src-tauri/src/plugin_host/runtime.rs 中的 RuntimeStatus 对应。
export type PluginStatus = "stopped" | "starting" | "running" | "restarting" | "crashed";

// 与 src-tauri/src/plugin_host/settings.rs 中的 SettingSpec、InfoItem 对应。
export type PluginSettingSpec = {
  key: string;
  type: "boolean" | "string" | "number" | "select";
  title: LocalizedText;
  description?: LocalizedText;
  default?: unknown;
  options?: { value: string; title: LocalizedText }[];
  min?: number;
  max?: number;
};

export type PluginInfoItem = {
  label: LocalizedText;
  value: string;
  copy: boolean;
  secret: boolean;
};

// 与 src-tauri/src/plugin_host/mod.rs 中的 PluginInfo、PluginsSnapshot 对应。
export type PluginInfo = {
  id: string;
  /** Comes with the island: needs no "allow third-party plugins" and cannot be uninstalled. */
  builtin: boolean;
  invalidReason: string | null;
  name: LocalizedText | null;
  description: LocalizedText | null;
  version: string;
  author: string;
  homepage: string;
  permissions: string[];
  commands: PluginCommand[];
  runtime: PluginRuntimeRequirement;
  hasProcess: boolean;
  enabled: boolean;
  needsApproval: boolean;
  status: PluginStatus;
  error: string | null;
  log: string[];
  settingsSchema: PluginSettingSpec[];
  /** Every declared setting with its value, defaults filled in. */
  settings: Record<string, unknown>;
  info: PluginInfoItem[];
  /** The user turned off its island.notify messages. */
  notificationsMuted: boolean;
  /** Command shortcuts that could not be registered because something else uses them. */
  keybindingConflicts: string[];
  /** Remembered answers for sensitive permissions; the user can revoke them. */
  sensitive: Partial<Record<SensitivePermission, PluginSensitiveChoice>>;
};

// 与 src-tauri/src/plugin_host/sensitive.rs 中的 SENSITIVE_PERMISSIONS、SensitiveChoice 对应。
export const SENSITIVE_PERMISSIONS = ["clipboard:read", "messages:read", "media:read", "shelf:read", "shelf:write"] as const;
export type SensitivePermission = (typeof SENSITIVE_PERMISSIONS)[number];
export type PluginSensitiveChoice = "allowed" | "denied";
export const isSensitivePermission = (name: string): name is SensitivePermission =>
  (SENSITIVE_PERMISSIONS as readonly string[]).includes(name);

export type PluginsSnapshot = {
  allowThirdParty: boolean;
  nodeAvailable: boolean;
  pluginsDir: string;
  plugins: PluginInfo[];
};

// 与 src-tauri/src/plugin_host/market.rs 中的 MarketEntry，以及 plugin_host/mod.rs 中的 MarketPlugin、MarketSnapshot 对应。
export type MarketPlugin = {
  id: string;
  name: LocalizedText;
  description: LocalizedText | null;
  version: string;
  apiVersion: number;
  minAppVersion: string | null;
  author: string;
  homepage: string;
  permissions: string[];
  /** Missing in indexes written before the field existed. */
  runtime: PluginRuntimeRequirement | null;
  download: { url: string; sha256: string; size: number };
  installedVersion: string | null;
  incompatible: string | null;
};

export type MarketSnapshot = {
  indexUrl: string;
  nodeAvailable: boolean;
  plugins: MarketPlugin[];
};

export function getPluginMarket() {
  return invoke<MarketSnapshot>("get_plugin_market");
}

export function installMarketPlugin(id: string) {
  return invoke<PluginsSnapshot>("install_market_plugin", { id });
}

export function uninstallPlugin(id: string) {
  return invoke<PluginsSnapshot>("uninstall_plugin", { id });
}

export function listPlugins() {
  return invoke<PluginsSnapshot>("list_plugins");
}

export function setPluginsAllowed(allowed: boolean) {
  return invoke<PluginsSnapshot>("set_plugins_allowed", { allowed });
}

export function setPluginEnabled(id: string, enabled: boolean) {
  return invoke<PluginsSnapshot>("set_plugin_enabled", { id, enabled });
}

export function reloadPlugins() {
  return invoke<PluginsSnapshot>("reload_plugins");
}

export function openPluginsFolder() {
  return invoke<void>("open_plugins_folder");
}

export const NODE_DOWNLOAD_URL = { "zh-CN": "https://nodejs.org/zh-cn/download", en: "https://nodejs.org/en/download" } as const;

/** Opens a plugin's homepage (or the Node.js download page) in the browser; only https links are allowed. */
export function openPluginHomepage(url: string) {
  return url.startsWith("https://") ? openUrl(url) : Promise.resolve();
}

export function setPluginSetting(id: string, key: string, value: unknown) {
  return invoke<PluginsSnapshot>("set_plugin_setting", { id, key, value });
}

export function runPluginCommand(id: string, command: string) {
  return invoke<void>("run_plugin_command", { id, command });
}

// 与 src-tauri/src/plugin_host/events.rs 中的 HOST_EVENT、EVENTS 对应。
const PLUGIN_HOST_EVENT = "plugin-host-event";
export type PluginHostEventName =
  | "todos.changed"
  | "note.changed"
  | "agentStatus.changed"
  | "island.expanded"
  | "island.collapsed"
  | "app.locale.changed";

/** Tells the plugin host that something plugins can subscribe to changed; it merges bursts. */
export function emitPluginHostEvent(name: PluginHostEventName, payload: Record<string, unknown>) {
  return emit(PLUGIN_HOST_EVENT, { name, payload });
}

// 与 src-tauri/src/plugin_host/notify.rs 中的 NOTIFICATION_EVENT、Notification 对应。
const PLUGIN_NOTIFICATION_EVENT = "plugin-notification";
export type PluginNotification = {
  pluginId: string;
  /** Null if the plugin was removed in the meantime. */
  pluginName: LocalizedText | null;
  title: string;
  body: string;
  durationMs: number;
  actions: { id: string; title: string }[];
};

/** Calls `onNotification` for each plugin island.notify message; resolves to the unlisten function. */
export function listenPluginNotifications(onNotification: (notification: PluginNotification) => void) {
  return listen<PluginNotification>(PLUGIN_NOTIFICATION_EVENT, (event) => onNotification(event.payload));
}

// 与 src-tauri/src/plugin_host/menus.rs 中的 TODO_CONTEXT、PluginMenuEntry 对应。
export const TODO_CONTEXT_MENU = "todo/context";
export type PluginMenu = typeof TODO_CONTEXT_MENU;
export type PluginMenuEntry = { pluginId: string; pluginName: LocalizedText; command: string; title: LocalizedText };

/** What running plugins add to an island menu (contributes.menus). */
export function listPluginMenu(menu: PluginMenu) {
  return invoke<PluginMenuEntry[]>("list_plugin_menu", { menu });
}

/** Sends the plugin `command` with `args.todoId`. */
export function runPluginMenuCommand(id: string, menu: PluginMenu, command: string, todoId: string) {
  return invoke<void>("run_plugin_menu_command", { id, menu, command, todoId });
}

// 与 src-tauri/src/plugin_host/keybindings.rs 中的 KEYBINDING_EVENT 对应。
const PLUGIN_KEYBINDING_EVENT = "plugin-keybinding";
export type PluginKeybindingPress = { pluginId: string; command: string; when: string | null };

/** Calls `onPress` when a plugin command's global shortcut is pressed; resolves to the unlisten function. */
export function listenPluginKeybindings(onPress: (press: PluginKeybindingPress) => void) {
  return listen<PluginKeybindingPress>(PLUGIN_KEYBINDING_EVENT, (event) => onPress(event.payload));
}

// 与 src-tauri/src/plugin_host/sensitive.rs 中的 REQUEST_EVENT 对应。
const PLUGIN_PERMISSION_REQUEST_EVENT = "plugin-permission-request";
export type PluginPermissionRequest = {
  requestId: number;
  pluginId: string;
  /** Null if the plugin was removed in the meantime. */
  pluginName: LocalizedText | null;
  permission: SensitivePermission;
  /** The plugin's call is refused if there is no answer within this time. */
  timeoutMs: number;
};
export type PluginPermissionAnswer = "allow" | "deny" | "once";

/** Calls `onRequest` when a plugin first uses a sensitive permission; resolves to the unlisten function. */
export function listenPluginPermissionRequests(onRequest: (request: PluginPermissionRequest) => void) {
  return listen<PluginPermissionRequest>(PLUGIN_PERMISSION_REQUEST_EVENT, (event) => onRequest(event.payload));
}

export function answerPluginPermission(requestId: number, answer: PluginPermissionAnswer) {
  return invoke<void>("answer_plugin_permission", { requestId, answer });
}

/** Forgets the answer for one sensitive permission; the plugin's next use asks again. */
export function revokePluginSensitivePermission(id: string, permission: SensitivePermission) {
  return invoke<PluginsSnapshot>("revoke_plugin_sensitive_permission", { id, permission });
}

export function runPluginNotificationAction(id: string, action: string) {
  return invoke<void>("run_plugin_notification_action", { id, action });
}

export function setPluginNotificationsMuted(id: string, muted: boolean) {
  return invoke<PluginsSnapshot>("set_plugin_notifications_muted", { id, muted });
}

/** Deletes what the plugin stored (its data folder and secrets); a running plugin is restarted. */
export function clearPluginData(id: string) {
  return invoke<PluginsSnapshot>("clear_plugin_data", { id });
}
