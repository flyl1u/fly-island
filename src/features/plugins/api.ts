import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

// 与 src-tauri/src/plugin_host/permissions.rs 中的 PERMISSIONS 对应。
export const PLUGIN_PERMISSIONS = ["todos:read", "todos:write", "notes:read", "notes:write", "agent-status:write"] as const;
export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number];

// 与 src-tauri/src/plugin_host/manifest.rs 中的 LocalizedText、PluginCommand 对应。
export type LocalizedText = { "zh-CN": string; en: string };
export type PluginCommand = { id: string; title: LocalizedText };

// 与 src-tauri/src/plugin_host/runtime.rs 中的 RuntimeStatus 对应。
export type PluginStatus = "stopped" | "starting" | "running" | "restarting" | "crashed";

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
  hasProcess: boolean;
  enabled: boolean;
  needsApproval: boolean;
  status: PluginStatus;
  error: string | null;
  log: string[];
};

export type PluginsSnapshot = {
  allowThirdParty: boolean;
  pluginsDir: string;
  plugins: PluginInfo[];
};

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

/** Opens a plugin's homepage in the browser; only https links are allowed. */
export function openPluginHomepage(url: string) {
  return url.startsWith("https://") ? openUrl(url) : Promise.resolve();
}

export function runPluginCommand(id: string, command: string) {
  return invoke<void>("run_plugin_command", { id, command });
}
