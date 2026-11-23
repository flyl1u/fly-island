import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { useTranslation } from "../../i18n";
import { useTrayPreference } from "./useTrayPreference";

export function TrayIconRow() {
  const t = useTranslation().settings.behavior;
  const { visible, busy, error, update } = useTrayPreference();
  return <SettingsToggleRow
    title={t.trayVisible}
    description={<>{t.trayVisibleHint}{error && <span role="alert"><br />{error === "storage" ? t.traySaveFailed : t.trayUpdateFailed(error.reason)}</span>}</>}
    checked={visible}
    disabled={busy}
    onChange={(next) => void update(next)}
  />;
}
