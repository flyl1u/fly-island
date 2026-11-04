export type IslandMode = "collapsed" | "expanded";

/** The pages built into the island. */
export type BuiltinPage = "todo" | "music" | "clipboard" | "shelf" | "qq" | "agents" | "translation";

/** Any page the expanded island can show. */
export type IslandPage = BuiltinPage;

export type NativeGlassState = "active" | "css-fallback" | "disabled";
