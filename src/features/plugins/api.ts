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
  "shelf:read",
  "shelf:write",
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
export type PluginStatus = "stopped" | "starting" | "running" | "restarting" | "crashed" | "idle";

// 与 src-tauri/src/plugin_host/runtime.rs 中的 Resources 对应：插件进程树占用的内存和 CPU。
export type PluginProcess = { name: string; memoryBytes: number; workingSetBytes: number };
export type PluginResources = {
  /** Private bytes of every process in the plugin's job. */
  memoryBytes: number;
  /** The idle runtime's share (PowerShell, Node.js); null for native plugins or until measured. */
  runtimeBytes: number | null;
  processes: PluginProcess[];
  cpuPercent: number;
  highCpu: boolean;
};

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
  /** Loaded in development mode from a folder: always on, with every permission it asks for (P10). */
  dev: boolean;
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
  /** The user's shortcuts per command id ("" = off); other commands use their manifest keybinding. */
  keybindings: Record<string, string>;
  /** Remembered answers for sensitive permissions; the user can revoke them. */
  sensitive: Partial<Record<PromptedPermission, PluginSensitiveChoice>>;
  /** "startup": runs while the island runs; "onDemand": starts on its activation events. */
  activation: "startup" | "onDemand";
  activationEvents: string[];
  /** From starting the process to its first message. */
  startupMs: number | null;
  resources: PluginResources | null;
  /** Why an on-demand plugin asked to keep running (host.keepAlive). */
  keepAlive: string | null;
  /** This version was taken off the market (revoked.json), and why (P11). */
  revoked: LocalizedText | null;
  /** A newer version in the market. */
  updateAvailable: string | null;
  /** The version an automatic update installed while the island has been running. */
  autoUpdated: string | null;
  /** Updates may install this plugin's pre-releases. */
  preRelease: boolean;
  /** A pre-release in the market newer than the stable version. */
  preReleaseAvailable: string | null;
  /** The memory limit in MB that applies to the plugin; one of PLUGIN_MEMORY_LIMITS_MB. */
  memoryLimitMb: number;
};

// 与 src-tauri/src/plugin_host/sensitive.rs 中的 SENSITIVE_PERMISSIONS、SensitiveChoice 对应。
export const SENSITIVE_PERMISSIONS = ["clipboard:read", "messages:read", "media:read", "shelf:read", "shelf:write"] as const;
export type SensitivePermission = (typeof SENSITIVE_PERMISSIONS)[number];
export type PluginSensitiveChoice = "allowed" | "denied";
export const isSensitivePermission = (name: string): name is SensitivePermission =>
  (SENSITIVE_PERMISSIONS as readonly string[]).includes(name);
// 与 src-tauri/src/plugin_host/uri.rs 中的 URI_PERMISSION 对应：插件第一次收到 focusd:// 链接前，岛上像敏感权限一样询问。
export const PLUGIN_URI_PERMISSION = "uri";
/** What the island asks about before first use: a sensitive permission, or opening links (onUri). */
export type PromptedPermission = SensitivePermission | typeof PLUGIN_URI_PERMISSION;
/** The plugin's permissions the island asks about, plus links when it lists onUri. */
export function promptedPermissions(plugin: Pick<PluginInfo, "permissions" | "activationEvents">): PromptedPermission[] {
  const prompted: PromptedPermission[] = plugin.permissions.filter(isSensitivePermission);
  if (plugin.activationEvents.includes("onUri")) prompted.push(PLUGIN_URI_PERMISSION);
  return prompted;
}

export type PluginsSnapshot = {
  allowThirdParty: boolean;
  nodeAvailable: boolean;
  pluginsDir: string;
  plugins: PluginInfo[];
  /** Install market updates that ask for no new permissions by themselves (default off). */
  autoUpdate: boolean;
  trustedPublishers: string[];
};

// 与 scripts/plugins/build-plugin-index.mjs 中的 CATEGORIES 对应。
export const MARKET_CATEGORIES = ["productivity", "todos", "developer", "media", "messages", "information", "utilities"] as const;
export type MarketCategory = (typeof MARKET_CATEGORIES)[number];

// 与 src-tauri/src/plugin_host/market.rs 中的 MarketEntry，以及 plugin_host/commands.rs 中的 MarketPlugin、MarketSnapshot 对应。
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
  /** GitHub user or organization; null in indexes written before publishers existed (the official one). */
  publisher: string | null;
  /** "owner/name" of the plugin's repository. */
  repo: string | null;
  categories: string[];
  /** It has pages with its own HTML (custom UI). */
  webview?: boolean;
  /** README.md and CHANGELOG.md from the plugin, Markdown, carried in the signed index. */
  readme?: string;
  changelog?: string;
  installedVersion: string | null;
  incompatible: string | null;
  /** This version was taken off the market, and why. */
  revoked: LocalizedText | null;
};

export type MarketSnapshot = {
  indexUrl: string;
  nodeAvailable: boolean;
  plugins: MarketPlugin[];
  trustedPublishers: string[];
  /** Always trusted; plugins without a publisher are its. */
  officialPublisher: string;
};

export const marketPublisher = (plugin: MarketPlugin, market: MarketSnapshot) => plugin.publisher || market.officialPublisher;

/** Turns on or off installing updates that ask for no new permissions by themselves. */
export function setPluginAutoUpdate(enabled: boolean) {
  return invoke<PluginsSnapshot>("set_plugin_auto_update", { enabled });
}

/** Trusting a publisher lets its plugins be installed. */
export function setPluginPublisherTrusted(publisher: string, trusted: boolean) {
  return invoke<PluginsSnapshot>("set_plugin_publisher_trusted", { publisher, trusted });
}

/** Reads the market now: revocations, available updates, automatic updates. */
export function checkPluginUpdates() {
  return invoke<PluginsSnapshot>("check_plugin_updates");
}

export function getPluginMarket() {
  return invoke<MarketSnapshot>("get_plugin_market");
}

/** The market as the island last read it (page or background check), without going online; null before that. */
export function getCachedPluginMarket() {
  return invoke<MarketSnapshot | null>("get_cached_plugin_market");
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
  permission: PromptedPermission;
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
export function revokePluginSensitivePermission(id: string, permission: PromptedPermission) {
  return invoke<PluginsSnapshot>("revoke_plugin_sensitive_permission", { id, permission });
}

export function runPluginNotificationAction(id: string, action: string) {
  return invoke<void>("run_plugin_notification_action", { id, action });
}

/** Memory limits to pick from, as MEMORY_LIMIT_CHOICES_MB in src-tauri/src/plugin_host/lifecycle.rs. */
export const PLUGIN_MEMORY_LIMITS_MB = [256, 512, 1024, 2048] as const;

export function setPluginMemoryLimit(id: string, megabytes: number) {
  return invoke<PluginsSnapshot>("set_plugin_memory_limit", { id, megabytes });
}

/** `null` goes back to the manifest's keybinding, `""` turns the shortcut off. */
export function setPluginKeybinding(id: string, command: string, keybinding: string | null) {
  return invoke<PluginsSnapshot>("set_plugin_keybinding", { id, command, keybinding });
}

export function setPluginPreRelease(id: string, enabled: boolean) {
  return invoke<PluginsSnapshot>("set_plugin_pre_release", { id, enabled });
}

export function setPluginNotificationsMuted(id: string, muted: boolean) {
  return invoke<PluginsSnapshot>("set_plugin_notifications_muted", { id, muted });
}

/** Deletes what the plugin stored (its data folder and secrets); a running plugin is restarted. */
export function clearPluginData(id: string) {
  return invoke<PluginsSnapshot>("clear_plugin_data", { id });
}
