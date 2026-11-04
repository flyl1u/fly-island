import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

// 与 src-tauri/src/plugin_host/permissions.rs 中的 PERMISSIONS 对应。
export const PLUGIN_PERMISSIONS = ["todos:read", "todos:write", "notes:read", "notes:write", "agent-status:write"] as const;
export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number];

// 与 src-tauri/src/plugin_host/manifest.rs 中的 LocalizedText、PluginCommand 对应。
export type LocalizedText = { "zh-CN": string; en: string };
export type PluginCommand = { id: string; title: LocalizedText };

// 与 src-tauri/src/plugin_host/manifest.rs 中的 runtime_requirement 对应：插件运行需要另外安装什么。
export type PluginRuntimeRequirement = "exe" | "powershell" | "node" | "none";

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
};

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
