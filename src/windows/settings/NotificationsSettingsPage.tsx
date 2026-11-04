import { ToggleControl } from "../../components/controls/ToggleControl";
import type { IslandSettings } from "../../features/appearance/types";
import { QQNotificationControls, type QQNotificationsController } from "../../features/messages/qq-notifications/QQNotifications";
import { WeChatReminderControls, type WeChatRemindersController } from "../../features/messages/wechat/WeChatReminders";
import { useTranslation } from "../../i18n";

export function NotificationsSettingsPage({
  settings,
  qqNotifications,
  wechatReminders,
  onSettingsChange,
}: {
  settings: IslandSettings;
  qqNotifications: QQNotificationsController;
  wechatReminders: WeChatRemindersController;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();

  return (
    <section className="settings-section settings-section--messages">
      <div className="settings-section__header"><span>{t.settings.messageReception}</span></div>
      <QQNotificationControls controller={qqNotifications} />
      <WeChatReminderControls controller={wechatReminders} />
      {/* The account itself is set up in the island's mail panel. */}
      <ToggleControl
        label={t.settings.modules.mail}
        checked={settings.mailEnabled}
        onChange={(mailEnabled) => onSettingsChange({ ...settings, mailEnabled })}
      />
      <p className="settings-section__hint">{t.settings.modules.hint}</p>
    </section>
  );
}
