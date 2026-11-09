export type IslandMode = "collapsed" | "expanded";

/** The pages built into the island. */
export type BuiltinPage = "todo" | "music" | "clipboard" | "shelf" | "qq" | "agents" | "translation";

/** Any page the expanded island can show; settings open as one unless they have their own window. */
export type IslandPage = BuiltinPage | "settings";

export type NativeGlassState = "active" | "css-fallback" | "disabled";
