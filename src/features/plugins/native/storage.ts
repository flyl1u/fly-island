import { readJson, writeJson } from "../../../lib/storage.ts";
import { isNativePluginId, NATIVE_PLUGIN_IDS, type NativePluginId } from "./catalog.ts";

/** Installed built-in plugins, as a list of ids in the order they were installed. */
export const NATIVE_PLUGINS_KEY = "focusd-island-native-plugins";

export type InstalledNativePlugins = Readonly<Record<NativePluginId, boolean>>;

export function normalizeInstalledNativePlugins(value: unknown): InstalledNativePlugins {
  const ids = Array.isArray(value) ? value.filter(isNativePluginId) : [];
  return Object.fromEntries(NATIVE_PLUGIN_IDS.map((id) => [id, ids.includes(id)])) as Record<NativePluginId, boolean>;
}

export function loadInstalledNativePlugins(): InstalledNativePlugins {
  return normalizeInstalledNativePlugins(readJson(NATIVE_PLUGINS_KEY));
}

export function saveNativePluginInstalled(id: NativePluginId, installed: boolean) {
  const stored = readJson(NATIVE_PLUGINS_KEY);
  const ids = (Array.isArray(stored) ? stored : []).filter(isNativePluginId).filter((item) => item !== id);
  return writeJson(NATIVE_PLUGINS_KEY, installed ? [...ids, id] : ids);
}
