import { Fragment } from "react";
import { useTranslation } from "../../i18n";
import { MailPanel, type MailController } from "./mail/MailPanel";
import { QQNotificationPanel, type QQNotificationsController } from "./qq-notifications/QQNotifications";
import { WeChatReminderPanel, type WeChatRemindersController } from "./wechat/WeChatReminders";
import { MessageSourceIcon } from "./MessageSourceIcon";
import { isOfficeSource, mailBadgeCount, type MessageSource } from "./messagePreview";
import { DEFAULT_SOURCE_ORDER } from "./sourceOrder";
import { TelegramMessages } from "./telegram/TelegramMessages";
import type { TelegramNotificationsController } from "./telegram/useTelegramNotifications";
import { OfficeImPanel } from "./office-im/OfficeImPanel";
import { useOfficeImSnapshot } from "./office-im/useOfficeIm";
import { useSourceReorder } from "./useSourceReorder";
import "./MessageToolbar.css";
import { PluginMessagesPanel } from "./PluginMessagesPanel";
import { PLUGIN_RUNTIME_ENABLED } from "../releaseFlags.ts";

export type MessageView = MessageSource;

type MessagesProps = {
  qqMail: MailController;
  qqNotifications: QQNotificationsController;
  wechatReminders: WeChatRemindersController;
  telegram?: TelegramNotificationsController;
  source: MessageView;
  /** Sources switched on; the tabs of the others are hidden. */
  enabledSources: Partial<Record<MessageSource, boolean>>;
  onSourceChange: (source: MessageView) => void;
  /** Opens the settings window on the mail page, where mailboxes are added. */
  onOpenMailSettings?: () => void;
};

/** The sources whose tabs show, for the reorder hook (hidden ones keep their place). */
function visibleSources(enabled: MessagesProps["enabledSources"]): MessageSource[] {
  return DEFAULT_SOURCE_ORDER
    .filter((source) => source === "plugin" ? PLUGIN_RUNTIME_ENABLED && enabled.plugin === true : enabled[source] === true);
}

export function messagePanelHeight(source: MessageView, readingMail = false) {
  return source === "qqMail" && readingMail ? 450 : 350;
}

export function MessagesPanel({ qqMail, qqNotifications, wechatReminders, telegram, source: requestedSource, enabledSources, onSourceChange, onOpenMailSettings }: MessagesProps) {
  const t = useTranslation();
  const source = requestedSource === "plugin" && !PLUGIN_RUNTIME_ENABLED
    ? enabledSources.wechat ? "wechat" : enabledSources.qq ? "qq" : "qqMail"
    : requestedSource;
  const { snapshot: qq } = qqNotifications;
  const telegramCount = telegram?.snapshot.items.length ?? 0;
  const office = useOfficeImSnapshot();
  const visible = visibleSources(enabledSources);
  const { order, handlers, consumeDragClick } = useSourceReorder(visible);
  const navigate = (next: MessageView) => { if (!consumeDragClick()) onSourceChange(next); };
  const tab = (candidate: MessageSource) => {
    const common = { type: "button" as const, "data-message-source": candidate, "aria-pressed": source === candidate, onClick: () => navigate(candidate), ...handlers(candidate) };
    if (candidate === "wechat") return <button {...common} aria-label={t.messages.wechatReminders}><MessageSourceIcon source="wechat" /><span className="message-source-label">{t.messages.wechat}</span>{wechatReminders.snapshot.pending && <span className="message-source-dot" aria-label={t.messages.newReminder} />}</button>;
    if (candidate === "qq") return <button {...common} aria-label={t.messages.qqNotifications}><MessageSourceIcon source="qq" /><span className="message-source-label">QQ</span>{qq.items.length > 0 && <span className="message-source-count">{mailBadgeCount(qq.items.length)}</span>}</button>;
    if (candidate === "qqMail") return <button {...common} aria-label={t.messages.qqMail}><MessageSourceIcon source="qqMail" /><span className="message-source-label">{t.messages.mail}</span>{qqMail.unreadTotal > 0 && <span className="message-source-count">{mailBadgeCount(qqMail.unreadTotal)}</span>}</button>;
    if (candidate === "telegram") return <button {...common}><MessageSourceIcon source="telegram" /><span className="message-source-label">{t.messages.sourceLabels.telegram}</span>{telegramCount > 0 && <span className="message-source-count">{mailBadgeCount(telegramCount)}</span>}</button>;
    if (isOfficeSource(candidate)) return <button {...common} aria-label={t.messages.office.reminders(t.messages.sourceLabels[candidate])}><MessageSourceIcon source={candidate} /><span className="message-source-label">{t.messages.sourceLabels[candidate]}</span>{office[candidate].pending && <span className="message-source-dot" aria-label={t.messages.newReminder} />}</button>;
    return <button {...common} aria-label={t.messages.sourceLabels.plugin}><MessageSourceIcon source="plugin" /><span className="message-source-label">{t.messages.sourceLabels.plugin}</span></button>;
  };
  const navigation = (
    <div className="message-sources" role="group" aria-label={t.messages.sources} title={t.messages.reorderHint}>
      {order.filter((candidate) => visible.includes(candidate)).map((candidate) => <Fragment key={candidate}>{tab(candidate)}</Fragment>)}
    </div>
  );

  if (source === "qqMail") return <MailPanel controller={qqMail} navigation={navigation} onOpenSettings={onOpenMailSettings} />;
  if (source === "plugin") return <PluginMessagesPanel navigation={navigation} />;
  if (isOfficeSource(source)) return <OfficeImPanel source={source} navigation={navigation} />;
  if (source === "wechat") return <WeChatReminderPanel controller={wechatReminders} navigation={navigation} />;
  if (source === "telegram" && telegram) return <TelegramMessages controller={telegram} navigation={navigation} />;
  return <QQNotificationPanel controller={qqNotifications} navigation={navigation} />;
}
