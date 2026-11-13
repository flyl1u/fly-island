import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "../../i18n";
import { useNeteasePlugin } from "./useNeteasePlugin";
import { NeteasePluginFeedback, pluginBusyLabel } from "./NeteasePluginFeedback";

export const INFLINK_URL = "https://github.com/apoint123/inflink-rs";

/** 岛屿提示卡里的一键启用：一个按钮、一个“了解详情”，下面是说明或结果。 */
export function NeteasePluginActions() {
  const text = useTranslation().music.plugin;
  const plugin = useNeteasePlugin();
  const [openFailed, setOpenFailed] = useState(false);
  const unsupported = plugin.status?.supported === false;
  const installed = Boolean(plugin.result) && !plugin.removed;
  return <div className="media-notice__plugin">
    <div className="media-notice__actions">
      {!installed && <button type="button" className="media-notice__primary" disabled={plugin.busy || unsupported}
        onClick={() => void plugin.install()}>{pluginBusyLabel(plugin, text) ?? (plugin.error ? text.retry : text.install)}</button>}
      <a className="media-notice__link" href={INFLINK_URL} onClick={(event) => {
        event.preventDefault();
        void openUrl(INFLINK_URL).catch(() => setOpenFailed(true));
      }}>{text.details}</a>
      {plugin.status?.tested === false && <span className="media-notice__muted">{text.untested}</span>}
    </div>
    {!plugin.result && !plugin.error && !plugin.busy && !unsupported && <span className="media-notice__hint">{text.disclosure}</span>}
    {unsupported && <span className="media-notice__feedback media-notice__feedback--error">{text.unsupported} {plugin.status?.version}</span>}
    <NeteasePluginFeedback plugin={plugin} className="media-notice__feedback" actionClassName="media-notice__inline-action" />
    {openFailed && <span className="media-notice__feedback media-notice__feedback--error" role="alert">{text.openFailed}</span>}
  </div>;
}
