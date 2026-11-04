import { useTranslation } from "./i18n";
import { QQMailPanel, type QQMailController } from "./QQMail";
import { QQNotificationPanel, type QQNotificationsController } from "./QQNotifications";
import { WeChatReminderPanel, type WeChatRemindersController } from "./WeChatReminders";
import { MessageSourceIcon } from "./MessageSourceIcon";
import { mailBadgeCount, type MessageSource } from "./messagePreview";

export type MessageView = MessageSource;

type MessagesProps = {
  qqMail: QQMailController;
  qqNotifications: QQNotificationsController;
  wechatReminders: WeChatRemindersController;
  source: MessageView;
  onSourceChange: (source: MessageView) => void;
};

export function messagePanelHeight(source: MessageView, readingMail = false) {
  return source === "qqMail" && readingMail ? 450 : 350;
}

export function MessagesPanel({ qqMail, qqNotifications, wechatReminders, source, onSourceChange }: MessagesProps) {
  const t = useTranslation();
  const { snapshot: qq } = qqNotifications;
  const navigate = (next: MessageView) => onSourceChange(next);
  const navigation = (
    <div className="message-sources" role="group" aria-label={t.messages.sources}>
      <button type="button" aria-label={t.messages.qqNotifications} aria-pressed={source === "qq"} onClick={() => navigate("qq")}><MessageSourceIcon source="qq" /><span>QQ</span>{qq.items.length > 0 && <span className="message-source-count">{mailBadgeCount(qq.items.length)}</span>}</button>
      <button type="button" aria-label={t.messages.wechatReminders} aria-pressed={source === "wechat"} onClick={() => navigate("wechat")}><MessageSourceIcon source="wechat" /><span>{t.messages.wechat}</span>{wechatReminders.snapshot.pending && <span className="message-source-dot" aria-label={t.messages.newReminder} />}</button>
      <button type="button" aria-label={t.messages.qqMail} aria-pressed={source === "qqMail"} onClick={() => navigate("qqMail")}><MessageSourceIcon source="qqMail" /><span>{t.messages.mail}</span>{qqMail.unreadCount > 0 && <span className="message-source-count">{mailBadgeCount(qqMail.unreadCount)}</span>}</button>
    </div>
  );

  if (source === "qqMail") return <QQMailPanel controller={qqMail} navigation={navigation} />;
  if (source === "wechat") return <WeChatReminderPanel controller={wechatReminders} navigation={navigation} />;
  return <QQNotificationPanel controller={qqNotifications} navigation={navigation} />;
}
