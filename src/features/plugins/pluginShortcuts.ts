import type { LocalizedText, PluginInfo } from "./api.ts";

/** One command of a switched-on plugin on the Shortcuts page. */
export type PluginShortcutRow = {
  /** `plugin:<plugin id>/<command id>`, also its id among the page's shortcut owners. */
  key: string;
  pluginId: string;
  pluginName: LocalizedText;
  commandId: string;
  title: LocalizedText;
  /** The manifest's keybinding, if any. */
  defaultShortcut: string | null;
  /** What applies now: the user's own, else the default; null when off or never set. */
  shortcut: string | null;
  /** The user changed it (or turned it off). */
  changed: boolean;
};

/** Mirrors `effective` in src-tauri/src/plugin_host/keybindings.rs: "" turns a shortcut off. */
export function effectiveShortcut(defaultShortcut: string | null, user: string | undefined) {
  if (user === undefined) return defaultShortcut;
  return user === "" ? null : user;
}

/** Every command of the plugins that are on, in plugin order. Built-in plugins are left out: only plugin processes register shortcuts. */
export function pluginShortcutRows(plugins: readonly PluginInfo[]): PluginShortcutRow[] {
  return plugins
    .filter((plugin) => (plugin.enabled || plugin.dev) && !plugin.builtin && !plugin.invalidReason && plugin.hasProcess && plugin.name)
    .flatMap((plugin) =>
      plugin.commands.map((command) => {
        const defaultShortcut = command.keybinding ?? null;
        const user = plugin.keybindings?.[command.id];
        return {
          key: `plugin:${plugin.id}/${command.id}`,
          pluginId: plugin.id,
          pluginName: plugin.name as LocalizedText,
          commandId: command.id,
          title: command.title,
          defaultShortcut,
          shortcut: effectiveShortcut(defaultShortcut, user),
          changed: user !== undefined,
        };
      }),
    );
}
