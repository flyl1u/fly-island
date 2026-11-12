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

/** Chat previews when available, with the centered launcher for basic reminders. */
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
      {messages.length > 0 ? (
        <div className="qq-panel__list" role="list" aria-label={t.wechat.messageList} aria-busy={busy}>
          {plain && (
            <article className="qq-panel__item" role="listitem">
              <button type="button" aria-label={t.wechat.open} disabled={busy} onClick={() => void openWeChat()}>
                <div className="qq-panel__item-heading"><strong>{t.messages.newReminder}</strong></div>
              </button>
            </article>
          )}
          {messages.map(({ id, receivedAt, contact, body }) => {
            const date = new Date(receivedAt);
            return (
              <article className="qq-panel__item" key={id} role="listitem" data-message-id={id}>
                <button type="button" aria-label={t.wechat.openFrom(contact)} disabled={busy} onClick={() => void openWeChat()}>
                  <div className="qq-panel__item-heading">
                    <strong>{contact}</strong>
                    <time dateTime={date.toISOString()}>{date.toLocaleTimeString(t.localeTag, { hour: "2-digit", minute: "2-digit" })}</time>
                  </div>
                  <p>{body}</p>
                </button>
              </article>
            );
          })}
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
