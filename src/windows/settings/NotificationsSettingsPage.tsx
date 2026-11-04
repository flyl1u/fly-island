import { useTranslation } from "../../i18n";
import { QQNotificationControls, type QQNotificationsController } from "../../features/messages/qq-notifications/QQNotifications";
import { WeChatReminderControls, type WeChatRemindersController } from "../../features/messages/wechat/WeChatReminders";

export function NotificationsSettingsPage({
  qqNotifications,
  wechatReminders,
}: {
  qqNotifications: QQNotificationsController;
  wechatReminders: WeChatRemindersController;
}) {
  const t = useTranslation();

  return (
    <section className="settings-section settings-section--messages">
      <div className="settings-section__header"><span>{t.settings.messageReception}</span></div>
      <QQNotificationControls controller={qqNotifications} />
      <WeChatReminderControls controller={wechatReminders} />
    </section>
  );
}
