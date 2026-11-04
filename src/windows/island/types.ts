export type IslandMode = "collapsed" | "expanded";

/** The pages built into the island. */
export type BuiltinPage = "todo" | "music" | "clipboard" | "shelf" | "qq" | "agents" | "translation";

/** A page a plugin adds: `plugin:<plugin id>/<view id>` (see features/plugin-views/model.ts). */
export type PluginPageId = `plugin:${string}`;

/** Any page the expanded island can show. */
export type IslandPage = BuiltinPage | PluginPageId;

export type NativeGlassState = "active" | "css-fallback" | "disabled";
