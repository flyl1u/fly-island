import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// Mirrors plugin_host/{manifest,protocol,storage,service,packages}.rs.
export type Localized = { "zh-CN": string; en: string };
export type PluginSetting = { key: string; label: Localized; type: "toggle" | "text" | "secret" | "select" | "number"; default: boolean | string; options: { value: string; label: Localized }[]; min?: number; max?: number };
import type { PluginPanelIcon } from "./panelTypes";
export type { PluginPanelIcon } from "./panelTypes";
export type PluginPanelRow = { id: string; title: string; detail: string | null; percent: number | null; countdownTo: number | null; tone: "normal" | "warning" | "danger" | null };
/** What a plugin's own island page shows; the host draws it with its own components. */
export type PluginPanel = { headline: string; note: string | null; rows: PluginPanelRow[]; actions: string[]; attention: boolean };
export type PluginManifest = { id: string; name: Localized; description: Localized; version: string; apiVersion: 1; runtime: { command: string }; permissions: string[]; contributes: string[]; panel?: { icon: PluginPanelIcon }; settings: PluginSetting[]; actions: { id: string; label: Localized }[] };
export type PluginQuota = { id: string; label: string; remainingPercent: number | null; secondaryPercent: number | null; balance: string | null; resetsAt: number | null; updatedAt: number };
export type PluginSession = { id: string; title: string; cwd: string | null; status: "running" | "waiting" | "completed"; updatedAt: number; action: string | null };
export type PluginNotification = { id: string; sourceId: string; appName: string; icon: string; title: string; body: string; receivedAt: number; action: string | null };
export type InstalledPlugin = { manifest: PluginManifest; enabled: boolean; directory: string; development: boolean; settings: Record<string, boolean | string> };
export type PluginsSnapshot = { registry: { developerMode: boolean; indexUrl: string; installed: Record<string, InstalledPlugin> }; live: Record<string, { status: string; quota: PluginQuota[]; sessions: PluginSession[]; notifications: PluginNotification[]; panel?: PluginPanel | null }> };
export type PluginIndexEntry = { id: string; version: string; name: Localized; description: Localized; apiVersion: number; url: string; sha256: string; size: number; minAppVersion: string };
export const PLUGINS_EVENT = "plugins-changed";
export const PLUGIN_INDEX_UNAVAILABLE = "plugin_index_unavailable";
export const getPlugins = () => invoke<PluginsSnapshot>("get_plugins");
export const getPluginsIndex = () => invoke<PluginIndexEntry[]>("get_plugins_index");
export const installPlugin = (id: string) => invoke<void>("install_plugin", { id });
export const uninstallPlugin = (id: string) => invoke<void>("uninstall_plugin", { id });
export const setPluginEnabled = (id: string, enabled: boolean) => invoke<void>("set_plugin_enabled", { id, enabled });
export const setPluginSetting = (id: string, key: string, value: boolean | string) => invoke<void>("set_plugin_setting", { id, key, value });
export const runPluginAction = (id: string, action: string) => invoke<unknown>("run_plugin_action", { id, action });
export const configurePlugins = (developerMode: boolean, indexUrl: string) => invoke<void>("configure_plugins", { developerMode, indexUrl });
export const loadDevelopmentPlugin = (directory: string) => invoke<void>("load_development_plugin", { directory });
export const onPluginsChanged = (refresh: () => void) => listen(PLUGINS_EVENT, refresh);
