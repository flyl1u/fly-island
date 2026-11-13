import { MessageCard } from "../MessageCard";
import { useTranslation } from "../../../i18n";
import type { ReactNode } from "react";
import { Power } from "lucide-react";
import { MessageSourceIcon } from "../MessageSourceIcon";
import "./WeChatReminders.css";
import type { WeChatRemindersController } from "./useWeChatReminders";

export { useWeChatReminders } from "./useWeChatReminders";
export type { WeChatRemindersController };

export function WeChatReminderControls({ controller, compact = false }: { controller: WeChatRemindersController; compact?: boolean }) {
  const { snapshot, busy, actionError, setEnabled } = controller;
  const t = useTranslation();
  return <div className={`qq-panel__controls${compact ? " qq-panel__controls--compact" : ""}`}>
    {compact ? <button className="icon-button message-receiver-toggle" type="button" role="switch" aria-checked={snapshot.enabled} aria-label={t.wechat.receive} disabled={busy} onClick={() => void setEnabled(!snapshot.enabled)}><Power size={15} strokeWidth={1.8} /></button> : <label className="qq-panel__toggle">
      <span>{t.messages.wechatReminders}</span>
      <span className="message-status" data-state={snapshot.status} role="status" aria-label={t.wechat.status[snapshot.status]} />
      <input type="checkbox" role="switch" aria-label={t.wechat.receive} checked={snapshot.enabled} disabled={busy}
        onChange={(event) => void setEnabled(event.currentTarget.checked)} />
    </label>}
    {!compact && (actionError || snapshot.error) && <p className="qq-panel__error" role="alert">{actionError || snapshot.error}</p>}
  </div>;
}

/** Previews and content-free reminders share the notification card surface. */
export function WeChatReminderPanel({ controller, navigation }: { controller: WeChatRemindersController; navigation: ReactNode }) {
  const { snapshot, busy, actionError, openWeChat } = controller;
  const t = useTranslation();
  const pending = snapshot.enabled && snapshot.status === "listening" && snapshot.pending;
  const label = snapshot.status === "listening" ? pending ? t.messages.newReminder : t.wechat.noReminders : t.wechat.status[snapshot.status];
  const messages = snapshot.messages;
  const plain = pending && messages[0]?.receivedAt !== snapshot.lastAttentionAt;
  return (
    <section className="qq-panel" aria-label={t.messages.wechatReminders}>
      <header className="qq-panel__header">
        {navigation}
        <div className="qq-panel__toolbar"><WeChatReminderControls controller={controller} compact /></div>
      </header>
      {(actionError || snapshot.error) && <p className="qq-panel__error" role="alert">{actionError || snapshot.error}</p>}
      {messages.length > 0 || pending ? (
        <div className="qq-panel__list message-card-list" role="list" aria-label={t.wechat.messageList} aria-busy={busy}>
          {plain && <MessageCard key={`reminder-${snapshot.lastAttentionAt}`} source="wechat" name={t.messages.wechat}
            timestamp={snapshot.lastAttentionAt ?? 0} body={t.messages.newReminder} muted disabled={busy}
            ariaLabel={t.wechat.open} onOpen={() => void openWeChat()} />}
          {messages.map(({ id, receivedAt, contact, body }) => (
            <MessageCard key={id} source="wechat" messageId={id} name={contact} timestamp={receivedAt} body={body}
              disabled={busy} ariaLabel={t.wechat.openFrom(contact)} onOpen={() => void openWeChat(id)} />
          ))}
        </div>
      ) : <div className="qq-panel__empty">
        <button
          className={`wechat-launch${pending ? " wechat-launch--pending" : ""}`}
          type="button"
          aria-label={`${label}，${t.wechat.clickToOpen}`}
          disabled={busy}
          onClick={() => void openWeChat()}
        >
          <span className="wechat-launch__icon"><MessageSourceIcon source="wechat" size={30} /></span>
          <span className="wechat-launch__state" role="status">{label}</span>
          <span className="wechat-launch__hint">{t.wechat.clickToOpen}</span>
        </button>
      </div>}
    </section>
  );
}
