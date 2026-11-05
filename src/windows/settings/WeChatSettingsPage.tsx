import { WeChatReminderControls, type WeChatRemindersController } from "../../features/messages/wechat/WeChatReminders";
import { useTranslation } from "../../i18n";

/** WeChat reminders: the receive switch and what can and cannot be known. */
export function WeChatSettingsPage({ wechatReminders }: { wechatReminders: WeChatRemindersController }) {
  const t = useTranslation();
  const labels = t.settings.messageSources;

  return (
    <section className="settings-section settings-section--messages">
      <div className="settings-section__header"><span>{labels.wechatTitle}</span></div>
      <WeChatReminderControls controller={wechatReminders} />
      <p className="settings-section__hint">{labels.wechatHint}</p>
    </section>
  );
}
