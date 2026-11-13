import { NeteasePluginControls } from "./NeteasePluginControls";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { useTranslation } from "../../i18n";
import { diagnosticMessageKey } from "./diagnosticStatus";
import { useMediaDiagnostics } from "./useMediaDiagnostics";

export function MediaCompatibilitySection() {
  const t = useTranslation();
  const { diagnostics, error } = useMediaDiagnostics();
  const text = t.music.diagnostics;
  return <SettingsGroup title={text.title} footer={error ?? (diagnostics.players.length === 0 ? text.empty : undefined)}>
    {diagnostics.players.map((player) => <SettingsRow key={player.sourceAppId} title={[player.label, player.version].filter(Boolean).join(" · ")}
      description={player.status === "smtcOff" && /kugou/i.test(player.sourceAppId) ? text.kugou : text[diagnosticMessageKey(player.status)](player.label)} >{ /cloudmusic|netease/i.test(player.sourceAppId) && <NeteasePluginControls settings /> }</SettingsRow>)}
    {!diagnostics.players.some((player) => /cloudmusic|netease/i.test(player.sourceAppId)) &&
      <SettingsRow title={t.music.plugin.player}><NeteasePluginControls settings /></SettingsRow>}
    <div className="media-diag-plugin"><small>{t.music.plugin.license}</small>
      <div className="media-diag-actions">{["https://github.com/apoint123/inflink-rs", "https://github.com/std-microblock/chromatic"].map((href, index) =>
        <a key={href} href={href} onClick={(event) => { event.preventDefault(); void openUrl(href).catch(() => {}); }}>{index === 0 ? "InfLink-rs" : "BetterNCM"}</a>)}</div>
    </div>
  </SettingsGroup>;
}
