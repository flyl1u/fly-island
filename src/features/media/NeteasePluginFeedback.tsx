import { useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { useTranslation } from "../../i18n";
import { pluginNotice } from "./pluginError";
import type { NeteasePlugin } from "./useNeteasePlugin";

/** 按钮下方的结果：一句话，加上能直接点的下一步（关闭网易云并继续 / 立即重启 / 打开插件目录）。 */
export function NeteasePluginFeedback({ plugin, className, actionClassName }: {
  plugin: NeteasePlugin; className: string; actionClassName: string;
}) {
  const text = useTranslation().music.plugin;
  const [openFailed, setOpenFailed] = useState(false);
  const notice = pluginNotice({ error: plugin.error, done: Boolean(plugin.result), removed: plugin.removed, restarted: plugin.restarted });
  const run = () => {
    if (notice?.action === "closeAndRetry") void plugin.closeAndRetry();
    else if (notice?.action === "restart") void plugin.restart();
    else if (notice?.action === "openPlugins") {
      void openPath(plugin.status?.pluginDir ?? plugin.error?.detail ?? "").catch(() => setOpenFailed(true));
    }
  };
  const actionLabel = notice?.action === "closeAndRetry" ? text.closeAndRetry
    : notice?.action === "restart" ? plugin.restarting ? text.restarting : text.restart : text.openPlugins;
  const preserved = plugin.result?.preservedFiles ?? [];
  return <>
    {notice && <span className={`${className} ${className}--${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
      <span>{text[notice.key]}{notice.detail ? ` ${notice.detail}` : ""}</span>
      {notice.action && <button type="button" className={actionClassName} disabled={plugin.busy} onClick={run}>{actionLabel}</button>}
    </span>}
    {plugin.result?.keptForeignLoader && <span className={className}>{text.keptForeignLoader}</span>}
    {preserved.length > 0 && <span className={className}>{text.preserved} {preserved.join("、")}</span>}
    {openFailed && <span className={`${className} ${className}--error`} role="alert">{text.openFailed}</span>}
  </>;
}

/** 正在进行时按钮上显示的阶段；空闲时为 null。 */
export function pluginBusyLabel(plugin: NeteasePlugin, text: ReturnType<typeof useTranslation>["music"]["plugin"]) {
  if (plugin.restarting) return text.restarting;
  if (!plugin.busy) return null;
  return text[plugin.progress?.stage === "verifying" ? "verifying" : plugin.progress?.stage === "copying" ? "copying" : "downloading"];
}
