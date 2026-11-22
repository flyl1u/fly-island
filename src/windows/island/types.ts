export type IslandMode = "collapsed" | "expanded";

/** The pages built into the island. */
export type BuiltinPage = "todo" | "music" | "clipboard" | "shelf" | "qq" | "agents" | "translation";

/** A page an installed plugin brings, opened from its own button in the header. */
export type PluginPage = `plugin:${string}`;

/** Any page the expanded island can show; settings open as one unless they have their own window. */
export type IslandPage = BuiltinPage | PluginPage | "settings";

export type NativeGlassState = "active" | "css-fallback" | "disabled";
