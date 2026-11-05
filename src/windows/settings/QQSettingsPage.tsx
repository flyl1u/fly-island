import { QQNotificationControls, type QQNotificationsController } from "../../features/messages/qq-notifications/QQNotifications";
import { useTranslation } from "../../i18n";

/** QQ notifications: the receive switch, notification access and what is read. */
export function QQSettingsPage({ qqNotifications }: { qqNotifications: QQNotificationsController }) {
  const t = useTranslation();
  const labels = t.settings.messageSources;

  return (
    <section className="settings-section settings-section--messages">
      <div className="settings-section__header"><span>{labels.qqTitle}</span></div>
      <QQNotificationControls controller={qqNotifications} />
      <p className="settings-section__hint">{labels.qqHint}</p>
    </section>
  );
}
