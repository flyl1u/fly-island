import { useState } from "react";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "../../i18n";
import { useNeteasePlugin } from "./useNeteasePlugin";
import { pluginErrorKey } from "./pluginError";
import "./MediaDiagnosticsCard.css";

export function NeteasePluginControls({ settings = false }: { settings?: boolean }) {
  const text = useTranslation().music.plugin;
  const plugin = useNeteasePlugin();
  const [confirm, setConfirm] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);
  const installed = plugin.status?.state === "installed";
  const showRemove = settings && (installed || plugin.status?.state === "loaderOnly" || plugin.result && !plugin.removed);
  const open = (path: string, url = false) => {
    void (url ? openUrl(path) : openPath(path)).catch(() => setOpenFailed(true));
  };
  return <div className="media-diag-plugin">
    {settings && plugin.status && <span>{text.states[plugin.status.state]}</span>}
    <div className="media-diag-actions">
      <button type="button" className="media-diag-primary" disabled={plugin.busy || !showRemove && plugin.status?.supported === false}
        onClick={() => {
          if (showRemove) {
            if (!confirm) { setConfirm(true); return; }
            setConfirm(false); void plugin.uninstall();
          } else { void plugin.install(); }
        }}>{plugin.busy ? text[plugin.progress?.stage === "verifying" ? "verifying" : plugin.progress?.stage === "copying" ? "copying" : "downloading"]
          : showRemove ? confirm ? text.confirmRemove : text.uninstall : plugin.error ? text.retry : text.install}</button>
      {!showRemove && plugin.status?.tested === false && <span>{text.untested}</span>}
      <a href="https://github.com/apoint123/inflink-rs" onClick={(e) => { e.preventDefault(); open(e.currentTarget.href, true); }}>{text.details}</a>
    </div>
    {!settings && !plugin.result && !plugin.error && !plugin.busy && <small>{text.disclosure}</small>}
    {plugin.status?.supported === false && <span>{text.unsupported} {plugin.status.version}</span>}
    {plugin.error && <span role="alert">{text[pluginErrorKey(plugin.error.kind)]} {plugin.error.detail}
      {plugin.error.kind === "LegacyConflict" && <button type="button" onClick={() => open(plugin.status?.pluginDir ?? plugin.error!.detail)}>{text.openPlugins}</button>}
    </span>}
    {plugin.result && <span role="status">{plugin.removed ? text.removed : text.success}</span>}
    {plugin.result?.keptForeignLoader && <span>{text.keptForeignLoader}</span>}
    {!!plugin.result?.preservedFiles.length && <span>{text.preserved} {plugin.result.preservedFiles.join("、")}</span>}
    {openFailed && <span role="alert">{text.openFailed}</span>}
  </div>;
}
