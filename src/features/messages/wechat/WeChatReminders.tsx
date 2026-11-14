import { MessageCard } from "../MessageCard";
import { useTranslation } from "../../../i18n";
import { useMemo, type ReactNode } from "react";
import { CheckCheck, Power } from "lucide-react";
import { useMessageCardExit } from "../useMessageCardExit";
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
  const { snapshot, busy, actionError, openWeChat, clear } = controller;
  const t = useTranslation();
  const pending = snapshot.enabled && snapshot.status === "listening" && snapshot.pending;
  const label = snapshot.status === "listening" ? pending ? t.messages.newReminder : t.wechat.noReminders : t.wechat.status[snapshot.status];
  const messages = snapshot.messages;
  const plain = pending && messages[0]?.receivedAt !== snapshot.lastAttentionAt;
  const cards = useMemo(() => [
    ...(plain ? [{ id: `reminder-${snapshot.lastAttentionAt}`, receivedAt: snapshot.lastAttentionAt ?? 0,
      contact: t.messages.wechat, body: t.messages.newReminder, plain: true }] : []),
    ...messages.map((message) => ({ ...message, plain: false })),
  ], [messages, plain, snapshot.lastAttentionAt, t.messages.wechat, t.messages.newReminder]);
  const displayed = useMessageCardExit(cards, snapshot.enabled);
  return (
    <section className="qq-panel" aria-label={t.messages.wechatReminders}>
      <header className="qq-panel__header">
        {navigation}
        <div className="qq-panel__toolbar">
          <button className="icon-button" type="button" aria-label={t.messages.clearAll} title={t.messages.clearAll}
            disabled={busy || (!snapshot.pending && messages.length === 0)} onClick={() => void clear()}><CheckCheck size={16} strokeWidth={1.5} absoluteStrokeWidth /></button>
          <WeChatReminderControls controller={controller} compact />
        </div>
      </header>
      {(actionError || snapshot.error) && <p className="qq-panel__error" role="alert">{actionError || snapshot.error}</p>}
      {displayed.items.length > 0 ? (
        <div className="qq-panel__list message-card-list" role="list" aria-label={t.wechat.messageList} aria-busy={busy}>
          {displayed.items.map(({ id, receivedAt, contact, body, plain: isPlain }) => (
            <MessageCard key={id} source="wechat" messageId={id} name={contact} timestamp={receivedAt} body={body}
              muted={isPlain} leaving={displayed.leaving} disabled={busy || displayed.leaving}
              ariaLabel={isPlain ? t.wechat.open : t.wechat.openFrom(contact)} onOpen={() => void openWeChat(isPlain ? undefined : id)} />
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
