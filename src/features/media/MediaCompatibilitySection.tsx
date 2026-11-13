import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { useTranslation } from "../../i18n";
import { diagnosticMessageKey } from "./diagnosticStatus";
import { useMediaDiagnostics } from "./useMediaDiagnostics";
import { useNeteasePlugin } from "./useNeteasePlugin";
import { NeteasePluginFeedback, pluginBusyLabel } from "./NeteasePluginFeedback";
import { INFLINK_URL } from "./NeteasePluginControls";
import "./MediaCompatibilitySection.css";

const LICENSE_LINKS = [["InfLink-rs", INFLINK_URL], ["BetterNCM", "https://github.com/std-microblock/chromatic"]] as const;
const isNetease = (id: string) => /cloudmusic|netease/i.test(id);

/** 网易云那一行：右边是“一键启用 / 卸载”，左边写状态和结果，和其他设置行一样排版。 */
function NeteasePluginRow({ title, message }: { title: string; message?: string }) {
  const text = useTranslation().music.plugin;
  const plugin = useNeteasePlugin();
  const [confirm, setConfirm] = useState(false);
  const state = plugin.status?.state;
  const removable = plugin.result ? !plugin.removed : state === "installed" || state === "loaderOnly";
  const label = pluginBusyLabel(plugin, text)
    ?? (removable ? (confirm ? text.confirmRemove : text.uninstall) : plugin.error ? text.retry : text.install);
  const control = <SettingsLinkButton tone={removable && confirm ? "danger" : "accent"}
    disabled={plugin.busy || (!removable && plugin.status?.supported === false)}
    onClick={() => {
      if (!removable) { void plugin.install(); return; }
      if (!confirm) { setConfirm(true); return; }
      setConfirm(false); void plugin.uninstall();
    }}>{label}</SettingsLinkButton>;
  const stateLine = plugin.status ? [text.states[plugin.status.state],
    plugin.status.supported === false ? `${text.unsupported} ${plugin.status.version ?? ""}` : plugin.status.tested === false ? text.untested : null,
  ].filter(Boolean).join(" · ") : null;
  return <SettingsRow title={title} control={control} description={<>
    {message && <span className="media-compat__line">{message}</span>}
    {stateLine && <span className="media-compat__line">{stateLine}</span>}
    <NeteasePluginFeedback plugin={plugin} className="media-compat__feedback" actionClassName="media-compat__action" />
  </>} />;
}

export function MediaCompatibilitySection() {
  const t = useTranslation();
  const { diagnostics, error } = useMediaDiagnostics();
  const text = t.music.diagnostics;
  const footer = <>
    {error ? <p>{error}</p> : diagnostics.players.length === 0 ? <p>{text.empty}</p> : null}
    <p>
      {t.music.plugin.license}{" "}
      {LICENSE_LINKS.map(([name, href]) => <a key={href} className="media-compat__link" href={href} onClick={(event) => {
        event.preventDefault(); void openUrl(href).catch(() => {});
      }}>{name}</a>)}
    </p>
  </>;
  return <SettingsGroup title={text.title} footer={footer}>
    {diagnostics.players.map((player) => {
      const title = [player.label, player.version].filter(Boolean).join(" · ");
      const message = player.status === "smtcOff" && /kugou/i.test(player.sourceAppId) ? text.kugou : text[diagnosticMessageKey(player.status)](player.label);
      return isNetease(player.sourceAppId)
        ? <NeteasePluginRow key={player.sourceAppId} title={title} message={message} />
        : <SettingsRow key={player.sourceAppId} title={title} description={message} />;
    })}
    {!diagnostics.players.some((player) => isNetease(player.sourceAppId)) && <NeteasePluginRow title={t.music.plugin.player} />}
  </SettingsGroup>;
}
