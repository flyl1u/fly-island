import { useTranslation } from "../../i18n";
import { MailPanel, type MailController } from "./mail/MailPanel";
import { QQNotificationPanel, type QQNotificationsController } from "./qq-notifications/QQNotifications";
import { WeChatReminderPanel, type WeChatRemindersController } from "./wechat/WeChatReminders";
import { MessageSourceIcon } from "./MessageSourceIcon";
import { mailBadgeCount, type MessageSource } from "./messagePreview";
import "./MessageToolbar.css";
import { PluginMessagesPanel } from "./PluginMessagesPanel";
import { PLUGINS_ENABLED } from "../plugins";

export type MessageView = MessageSource;

type MessagesProps = {
  qqMail: MailController;
  qqNotifications: QQNotificationsController;
  wechatReminders: WeChatRemindersController;
  source: MessageView;
  /** Sources switched on; the tabs of the others are hidden. */
  enabledSources: Record<Exclude<MessageSource, "plugin">, boolean> & { plugin?: boolean };
  onSourceChange: (source: MessageView) => void;
  /** Opens the settings window on the mail page, where mailboxes are added. */
  onOpenMailSettings?: () => void;
};

export function messagePanelHeight(source: MessageView, readingMail = false) {
  return source === "qqMail" && readingMail ? 450 : 350;
}

export function MessagesPanel({ qqMail, qqNotifications, wechatReminders, source: requestedSource, enabledSources, onSourceChange, onOpenMailSettings }: MessagesProps) {
  const t = useTranslation();
  const source = requestedSource === "plugin" && !PLUGINS_ENABLED
    ? enabledSources.wechat ? "wechat" : enabledSources.qq ? "qq" : "qqMail"
    : requestedSource;
  const { snapshot: qq } = qqNotifications;
  const navigate = (next: MessageView) => onSourceChange(next);
  const navigation = (
    <div className="message-sources" role="group" aria-label={t.messages.sources}>
      {enabledSources.wechat && <button type="button" aria-label={t.messages.wechatReminders} aria-pressed={source === "wechat"} onClick={() => navigate("wechat")}><MessageSourceIcon source="wechat" /><span className="message-source-label">{t.messages.wechat}</span>{wechatReminders.snapshot.pending && <span className="message-source-dot" aria-label={t.messages.newReminder} />}</button>}
      {enabledSources.qq && <button type="button" aria-label={t.messages.qqNotifications} aria-pressed={source === "qq"} onClick={() => navigate("qq")}><MessageSourceIcon source="qq" /><span className="message-source-label">QQ</span>{qq.items.length > 0 && <span className="message-source-count">{mailBadgeCount(qq.items.length)}</span>}</button>}
      {enabledSources.qqMail && <button type="button" aria-label={t.messages.qqMail} aria-pressed={source === "qqMail"} onClick={() => navigate("qqMail")}><MessageSourceIcon source="qqMail" /><span className="message-source-label">{t.messages.mail}</span>{qqMail.unreadTotal > 0 && <span className="message-source-count">{mailBadgeCount(qqMail.unreadTotal)}</span>}</button>}
      {PLUGINS_ENABLED && enabledSources.plugin && <button type="button" aria-label={t.messages.sourceLabels.plugin} aria-pressed={source === "plugin"} onClick={() => navigate("plugin")}><MessageSourceIcon source="plugin" /><span className="message-source-label">{t.messages.sourceLabels.plugin}</span></button>}
    </div>
  );

  if (source === "qqMail") return <MailPanel controller={qqMail} navigation={navigation} onOpenSettings={onOpenMailSettings} />;
  if (source === "plugin") return <PluginMessagesPanel navigation={navigation} />;
  if (source === "wechat") return <WeChatReminderPanel controller={wechatReminders} navigation={navigation} />;
  return <QQNotificationPanel controller={qqNotifications} navigation={navigation} />;
}
