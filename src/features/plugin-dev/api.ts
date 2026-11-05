import { invoke } from "@tauri-apps/api/core";

// 与 src-tauri/src/plugin_host/dev.rs 中的 DevSnapshot 对应：开发模式是否打开、从哪些文件夹加载了插件。
export type PluginDevState = { enabled: boolean; plugins: { id: string; path: string }[] };

// 与 src-tauri/src/plugin_host/runtime/trace.rs 中的 TraceEntry 对应：一行原始 JSON-RPC 收发记录。
export type PluginTraceEntry = { at: number; outgoing: boolean; text: string };

// 与 plugins/schema/rpc.json 中的 events 对应：可以手动发给开发中插件的事件。
export const PLUGIN_EVENT_NAMES = [
  "todos.changed",
  "note.changed",
  "agentStatus.changed",
  "island.expanded",
  "island.collapsed",
  "app.locale.changed",
  "clipboard.changed",
  "messages.received",
  "media.changed",
] as const;

export const getPluginDevState = () => invoke<PluginDevState>("get_plugin_dev_state");

/** Turning it off unloads every development plugin. */
export const setPluginDevMode = (enabled: boolean) => invoke<PluginDevState>("set_plugin_dev_mode", { enabled });

/** Loads (or loads again) the plugin in a folder of any name. */
export const loadDevPlugin = (path: string) => invoke<PluginDevState>("load_dev_plugin", { path });

export const reloadDevPlugin = (id: string) => invoke<PluginDevState>("reload_dev_plugin", { id });

export const unloadDevPlugin = (id: string) => invoke<PluginDevState>("unload_dev_plugin", { id });

/** The last 200 JSON-RPC lines between the island and a development plugin. */
export const getPluginRpcTrace = (id: string) => invoke<PluginTraceEntry[]>("get_plugin_rpc_trace", { id });

/** Sends `event { name, payload }` to a running development plugin, subscribed or not. */
export const sendPluginDevEvent = (id: string, name: string, payload: unknown) =>
  invoke<void>("send_plugin_dev_event", { id, name, payload });
