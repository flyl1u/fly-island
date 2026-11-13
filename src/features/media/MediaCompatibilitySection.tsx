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
      description={player.status === "smtcOff" && /kugou/i.test(player.sourceAppId) ? text.kugou : text[diagnosticMessageKey(player.status)](player.label)} />)}
  </SettingsGroup>;
}
