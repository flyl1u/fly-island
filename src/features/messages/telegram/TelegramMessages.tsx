import type { ReactNode } from "react";
import { useTranslation } from "../../../i18n";
import { MessageSourceIcon } from "../MessageSourceIcon";
import { MessageCard } from "../MessageCard";
import type { TelegramNotificationsController } from "./useTelegramNotifications";
import "../qq-notifications/QQNotifications.css";
import "../wechat/WeChatReminders.css";

export function TelegramMessages({ controller, navigation }: {
  controller: TelegramNotificationsController;
  navigation: ReactNode;
}) {
  const t = useTranslation();
  const { snapshot, actionError, busy, openApp, openNotice } = controller;
  const error = actionError || snapshot.error;
  const label = snapshot.status === "listening"
    ? t.messages.telegramNoMessages
    : t.qq.status[snapshot.status];
  return <section className="qq-panel" aria-label={t.messages.sourceLabels.telegram}>
    <header className="qq-panel__header">{navigation}</header>
    {error && <p className="qq-panel__error" role="alert">{error}</p>}
    {snapshot.items.length > 0 ? <div className="qq-panel__list message-card-list" role="list">
      {snapshot.items.map((item) => <MessageCard key={item.id} messageId={item.id} source="telegram"
        name={item.title || t.messages.sourceLabels.telegram} timestamp={item.createdAt} body={item.body}
        disabled={busy} onOpen={() => void openNotice(item.id)} />)}
    </div> : <div className="qq-panel__empty">
      <button className="wechat-launch" type="button"
        aria-label={`${label}，${t.messages.telegramClickToOpen}`} disabled={busy} onClick={() => void openApp()}>
        <span className="wechat-launch__icon"><MessageSourceIcon source="telegram" size={30} /></span>
        <span className="wechat-launch__state" role="status">{label}</span>
        <span className="wechat-launch__hint">{t.messages.telegramClickToOpen}</span>
      </button>
    </div>}
  </section>;
}
