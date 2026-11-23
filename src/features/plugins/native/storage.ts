import { readJson, writeJson } from "../../../lib/storage.ts";
import { isNativePluginId, NATIVE_PLUGIN_IDS, type NativePluginId } from "./catalog.ts";

/** Installed built-in plugins, as a list of ids in the order they were installed. */
export const NATIVE_PLUGINS_KEY = "fly-island-native-plugins";
export const DISABLED_NATIVE_PLUGINS_KEY = "fly-island-native-plugins-disabled";

type NativePluginFlags = Readonly<Record<NativePluginId, boolean>>;
export type InstalledNativePlugins = NativePluginFlags;
export type NativePluginStates = Readonly<{ installed: NativePluginFlags; enabled: NativePluginFlags }>;

function pluginIds(value: unknown): NativePluginId[] {
  return Array.isArray(value) ? [...new Set(value.filter(isNativePluginId))] : [];
}

function pluginFlags(predicate: (id: NativePluginId) => boolean): NativePluginFlags {
  return Object.fromEntries(NATIVE_PLUGIN_IDS.map((id) => [id, predicate(id)])) as Record<NativePluginId, boolean>;
}

export function normalizeInstalledNativePlugins(value: unknown): InstalledNativePlugins {
  const ids = pluginIds(value);
  return pluginFlags((id) => ids.includes(id));
}

export function normalizeNativePluginStates(installedValue: unknown, disabledValue: unknown): NativePluginStates {
  const installed = normalizeInstalledNativePlugins(installedValue);
  const disabled = pluginIds(disabledValue);
  return { installed, enabled: pluginFlags((id) => installed[id] && !disabled.includes(id)) };
}

export function loadInstalledNativePlugins(): InstalledNativePlugins {
  return normalizeInstalledNativePlugins(readJson(NATIVE_PLUGINS_KEY));
}

export function loadNativePluginStates(): NativePluginStates {
  return normalizeNativePluginStates(readJson(NATIVE_PLUGINS_KEY), readJson(DISABLED_NATIVE_PLUGINS_KEY));
}

function saveNativePluginDisabled(id: NativePluginId, disabled: boolean) {
  const ids = pluginIds(readJson(DISABLED_NATIVE_PLUGINS_KEY));
  if (ids.includes(id) === disabled) return true;
  return writeJson(DISABLED_NATIVE_PLUGINS_KEY, disabled ? [...ids, id] : ids.filter((item) => item !== id));
}

export function saveNativePluginEnabled(id: NativePluginId, enabled: boolean) {
  return loadInstalledNativePlugins()[id] && saveNativePluginDisabled(id, !enabled);
}

export function saveNativePluginInstalled(id: NativePluginId, installed: boolean) {
  const ids = pluginIds(readJson(NATIVE_PLUGINS_KEY)).filter((item) => item !== id);
  // Clear a stale disable marker before installing, or after the plugin is no longer active.
  if (installed) return saveNativePluginDisabled(id, false) && writeJson(NATIVE_PLUGINS_KEY, [...ids, id]);
  return writeJson(NATIVE_PLUGINS_KEY, ids) && saveNativePluginDisabled(id, false);
}
