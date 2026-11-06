// What a built-in plugin that works in the island window needs to know about itself.
import type { PluginsSnapshot } from "./api";

export type BuiltinPluginState = {
  /** On in Settings > Plugins, every permission granted, and started by the host. */
  enabled: boolean;
  /** Every declared setting with its value, defaults filled in. */
  settings: Record<string, unknown>;
};

export const BUILTIN_PLUGIN_OFF: BuiltinPluginState = { enabled: false, settings: {} };

/** The plugin's state in a `list_plugins` snapshot; off when it is missing or not a built-in plugin. */
export function builtinPluginState(snapshot: PluginsSnapshot | null, id: string): BuiltinPluginState {
  const plugin = snapshot?.plugins.find((entry) => entry.id === id && entry.builtin);
  if (!plugin) return BUILTIN_PLUGIN_OFF;
  return { enabled: plugin.enabled && plugin.status === "running", settings: plugin.settings };
}
