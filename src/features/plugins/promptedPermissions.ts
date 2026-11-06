import { PLUGIN_PERMISSIONS, type PluginInfo, type PluginPermission } from "./api";

// 与 src-tauri/src/plugin_host/sensitive.rs 中的 SENSITIVE_PERMISSIONS、SensitiveChoice 对应。
export const SENSITIVE_PERMISSIONS = ["clipboard:read", "messages:read", "media:read", "shelf:read", "shelf:write"] as const;
export type SensitivePermission = (typeof SENSITIVE_PERMISSIONS)[number];
export type PluginSensitiveChoice = "allowed" | "denied";
export const isSensitivePermission = (name: string): name is SensitivePermission =>
  (SENSITIVE_PERMISSIONS as readonly string[]).includes(name);
// 与 src-tauri/src/plugin_host/uri.rs 中的 URI_PERMISSION 对应：插件第一次收到 focusd:// 链接前，岛上像敏感权限一样询问。
export const PLUGIN_URI_PERMISSION = "uri";
/** What the island asks the user about: a sensitive permission, an optional permission, or opening links (onUri). */
export type PromptedPermission = PluginPermission | typeof PLUGIN_URI_PERMISSION;
const isPluginPermission = (name: string): name is PluginPermission => (PLUGIN_PERMISSIONS as readonly string[]).includes(name);

/** The plugin's permissions the island asks about: sensitive ones, optional ones (permissions.request), and links when it lists onUri. */
export function promptedPermissions(plugin: Pick<PluginInfo, "permissions" | "activationEvents"> & { optionalPermissions?: string[] }): PromptedPermission[] {
  const prompted: PromptedPermission[] = plugin.permissions.filter(isSensitivePermission);
  for (const name of plugin.optionalPermissions ?? []) {
    if (isPluginPermission(name) && !prompted.includes(name)) prompted.push(name);
  }
  if (plugin.activationEvents.includes("onUri")) prompted.push(PLUGIN_URI_PERMISSION);
  return prompted;
}
