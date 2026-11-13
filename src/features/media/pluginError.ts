import type { MediaPluginError, MediaPluginErrorKind } from "./api";

export function pluginErrorKey(kind: MediaPluginErrorKind) {
  return { NeedsClose: "needsClose", UserDeclined: "userDeclined", LegacyConflict: "legacyConflict",
    Unsupported: "unsupported", Network: "network", HashMismatch: "hashMismatch", Busy: "busy", Io: "io" }[kind] as
    "needsClose" | "userDeclined" | "legacyConflict" | "unsupported" | "network" | "hashMismatch" | "busy" | "io";
}

export type PluginNoticeAction = "closeAndRetry" | "restart" | "openPlugins";
export type PluginNotice = {
  tone: "error" | "status";
  key: ReturnType<typeof pluginErrorKey> | "success" | "removed" | "restarted";
  /** 只有版本号和文件错误的原文对用户有用；其余原文是给开发看的英文，不显示。 */
  detail?: string;
  action?: PluginNoticeAction;
};

/** 安装 / 卸载之后在按钮下方显示的一句话，以及它旁边可以直接点的下一步。 */
export function pluginNotice({ error, done, removed, restarted }: {
  error: MediaPluginError | null; done: boolean; removed: boolean; restarted: boolean;
}): PluginNotice | null {
  if (error) {
    const action = error.kind === "NeedsClose" ? "closeAndRetry" : error.kind === "LegacyConflict" ? "openPlugins" : undefined;
    const detail = error.kind === "Io" || error.kind === "Unsupported" ? error.detail : undefined;
    return { tone: "error", key: pluginErrorKey(error.kind), detail, action };
  }
  if (!done) return null;
  if (removed) return { tone: "status", key: "removed" };
  return restarted ? { tone: "status", key: "restarted" } : { tone: "status", key: "success", action: "restart" };
}
