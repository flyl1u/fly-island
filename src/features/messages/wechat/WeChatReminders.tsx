import { useTranslation } from "../../../i18n";
import type { ReactNode } from "react";
import { ArrowUpRight, Power } from "lucide-react";
import { MessageSourceIcon } from "../MessageSourceIcon";
import "./WeChatReminders.css";
import type { WeChatRemindersController } from "./useWeChatReminders";

export { useWeChatReminders } from "./useWeChatReminders";
export type { WeChatRemindersController };

export function WeChatReminderControls({ controller, compact = false }: { controller: WeChatRemindersController; compact?: boolean }) {
  const { snapshot, busy, actionError, setEnabled } = controller;
  const t = useTranslation();
  return <div className={`qq-panel__controls${compact ? " qq-panel__controls--compact" : ""}`}>
    {compact ? <button className="icon-button message-receiver-toggle" type="button" role="switch" aria-checked={snapshot.enabled} aria-label={t.wechat.receive} title={snapshot.enabled ? t.wechat.pause : t.wechat.receive} disabled={busy} onClick={() => void setEnabled(!snapshot.enabled)}><Power size={15} strokeWidth={1.8} /></button> : <label className="qq-panel__toggle" title={snapshot.enabled ? t.wechat.pause : t.wechat.receive}>
      <span>{t.messages.wechatReminders}</span>
      <span className="message-status" data-state={snapshot.status} role="status" aria-label={t.wechat.status[snapshot.status]} title={t.wechat.status[snapshot.status]} />
      <input type="checkbox" role="switch" aria-label={t.wechat.receive} checked={snapshot.enabled} disabled={busy}
        onChange={(event) => void setEnabled(event.currentTarget.checked)} />
    </label>}
    {!compact && (actionError || snapshot.error) && <p className="qq-panel__error" role="alert">{actionError || snapshot.error}</p>}
  </div>;
}

export function WeChatReminderPanel({ controller, navigation }: { controller: WeChatRemindersController; navigation: ReactNode }) {
  const { snapshot, busy, actionError, openWeChat } = controller;
  const t = useTranslation();
  const pending = snapshot.enabled && snapshot.status === "listening" && snapshot.pending;
  const label = snapshot.status === "listening" ? pending ? t.messages.newReminder : t.wechat.noReminders : t.wechat.status[snapshot.status];
  return (
    <section className="qq-panel" aria-label={t.messages.wechatReminders}>
      <header className="qq-panel__header">
        {navigation}
        <div className="qq-panel__toolbar"><WeChatReminderControls controller={controller} compact /><button className="icon-button" type="button" title={t.wechat.open} aria-label={t.wechat.open} disabled={busy} onClick={() => void openWeChat()}><ArrowUpRight size={16} strokeWidth={1.8} /></button></div>
      </header>
      {(actionError || snapshot.error) && <p className="qq-panel__error" role="alert">{actionError || snapshot.error}</p>}
      <div className={`qq-panel__empty${pending ? " wechat-reminder-state--pending" : ""}`} role="status">
        <span className="message-empty-icon"><MessageSourceIcon source="wechat" size={28} /></span>
        <span>{label}</span>
      </div>
    </section>
  );
}
