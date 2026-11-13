import type { MediaPluginErrorKind } from "./api";
export function pluginErrorKey(kind: MediaPluginErrorKind) {
  return { NeedsClose: "needsClose", UserDeclined: "userDeclined", LegacyConflict: "legacyConflict",
    Unsupported: "unsupported", Network: "network", HashMismatch: "hashMismatch", Busy: "busy", Io: "io" }[kind] as
    "needsClose" | "userDeclined" | "legacyConflict" | "unsupported" | "network" | "hashMismatch" | "busy" | "io";
}
