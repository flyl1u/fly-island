import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { useTelegramNotifications } from "../../features/messages/telegram/useTelegramNotifications";
import { PluginIcon } from "../../features/plugins/PluginIcon";
import { useTranslation } from "../../i18n";

/** The installed Telegram plugin's group on the Messages page: its receive switch and access. */
export function TelegramSettingsGroup() {
  const t = useTranslation();
  const labels = t.settings.messageSources;
  const { snapshot, actionError, busy, setEnabled, requestAccess, openSettings } = useTelegramNotifications();
  const needsAccess = snapshot.enabled && (snapshot.status === "permissionRequired" || snapshot.status === "permissionDenied");
  const error = actionError || snapshot.error || (needsAccess ? t.qq.status[snapshot.status] : null);

  return <SettingsGroup anchor="telegram" icon={<PluginIcon id="telegram" size={16} />}
    title={t.settings.plugins.market.items.telegram.name}
    footer={error ? <span className="messages-settings__error" role="alert">{error}</span> : labels.telegramHint}>
    <SettingsToggleRow title={labels.telegramReceive} checked={snapshot.enabled} onChange={(enabled) => void setEnabled(enabled)} />
    {needsAccess && <SettingsRow title={labels.telegramAccess} indent control={snapshot.status === "permissionRequired"
      ? <SettingsLinkButton disabled={busy} onClick={() => void requestAccess()}>{t.qq.grant}</SettingsLinkButton>
      : <SettingsLinkButton disabled={busy} onClick={() => void openSettings()}>{t.qq.settings}</SettingsLinkButton>} />}
  </SettingsGroup>;
}
