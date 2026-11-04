import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";

// 与 src-tauri/src/plugin_host/manifest.rs 中的 LocalizedText 对应。
export type ViewLocalizedText = { "zh-CN": string; en: string };

// 与 src-tauri/src/plugin_host/view_specs.rs 中的 ViewTemplate 对应。
export type PluginViewTemplate = "list" | "detail" | "form" | "status";

// 与 src-tauri/src/plugin_host/runtime.rs 中的 RuntimeStatus 对应。
export type PluginViewRunState = "stopped" | "starting" | "running" | "restarting" | "crashed";

// 与 src-tauri/src/plugin_host/views.rs 中的 PluginViewEntry 对应。
export type PluginViewEntry = {
  pluginId: string;
  pluginName: ViewLocalizedText;
  viewId: string;
  title: ViewLocalizedText;
  icon: string;
  template: PluginViewTemplate;
  status: PluginViewRunState;
  error: string | null;
};

// 与 src-tauri/src/plugin_host/views.rs 中的 PluginStatusEntry 对应。
export type PluginStatusEntry = {
  pluginId: string;
  itemId: string;
  priority: number;
  text: string;
  tooltip: string | null;
  tone: "neutral" | "accent" | "warning" | "danger";
};

// 与 src-tauri/src/plugin_host/views.rs 中的 PluginViewsSnapshot 对应。
export type PluginViewsSnapshot = { views: PluginViewEntry[]; status: PluginStatusEntry[] };

// 与 src-tauri/src/plugin_host/views.rs 中的 VIEW_EVENT 对应。
const PLUGIN_VIEW_CHANGED_EVENT = "plugin-view-changed";
export type PluginViewChanged =
  | { kind: "view"; pluginId: string; viewId: string; model: unknown }
  | { kind: "status"; pluginId: string; itemId: string; status: unknown }
  | { kind: "reset"; pluginId: string; status: PluginViewRunState };

export function listPluginViews() {
  return invoke<PluginViewsSnapshot>("list_plugin_views");
}

/** Calls `onChange` for plugin view, status and restart changes; resolves to the unlisten function. */
export function listenPluginViewChanged(onChange: (change: PluginViewChanged) => void) {
  return listen<PluginViewChanged>(PLUGIN_VIEW_CHANGED_EVENT, (event) => onChange(event.payload));
}

/** Tells the plugin its page is on screen or not; resolves to the page's model when shown (null before the plugin sent one). */
export function setPluginViewVisible(id: string, viewId: string, visible: boolean) {
  return invoke<unknown>("set_plugin_view_visible", { id, viewId, visible });
}

export function runPluginViewAction(id: string, viewId: string, actionId: string, itemId: string | null, checked: boolean | null) {
  return invoke<void>("run_plugin_view_action", { id, viewId, itemId, actionId, checked });
}

export function submitPluginView(id: string, viewId: string, values: Record<string, unknown>) {
  return invoke<void>("submit_plugin_view", { id, viewId, values });
}

export function searchPluginView(id: string, viewId: string, query: string) {
  return invoke<void>("search_plugin_view", { id, viewId, query });
}

export function restartPlugin(id: string) {
  return invoke<void>("restart_plugin", { id });
}

/** Opens a link from a plugin page in the browser; only https links are allowed. */
export function openPluginViewLink(url: string) {
  return url.startsWith("https://") ? openUrl(url) : Promise.resolve();
}
