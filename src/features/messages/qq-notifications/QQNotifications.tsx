import { useTranslation } from "../../../i18n";
import type { ReactNode } from "react";
import { ArrowUpRight, KeyRound, Power, RefreshCw, Settings2, Trash2 } from "lucide-react";
import { MessageSourceIcon } from "../MessageSourceIcon";
import "./QQNotifications.css";
import type { QQNotificationsController } from "./useQQNotifications";

export { useQQNotifications } from "./useQQNotifications";
export type { QQNotificationsController };

export function QQNotificationControls({ controller, compact = false }: { controller: QQNotificationsController; compact?: boolean }) {
  const { snapshot, busy, actionError, setEnabled, requestAccess, openSettings } = controller;
  const t = useTranslation();
  const needsAccess = snapshot.status === "permissionRequired" || snapshot.status === "permissionDenied";
  return <div className={`qq-panel__controls${compact ? " qq-panel__controls--compact" : ""}`}>
    <div className="qq-panel__control-row">
      {compact ? <button className="icon-button message-receiver-toggle" type="button" role="switch" aria-checked={snapshot.enabled} aria-label={t.qq.receive} disabled={busy} onClick={() => void setEnabled(!snapshot.enabled)}><Power size={15} strokeWidth={1.8} /></button> : <label className="qq-panel__toggle">
        <span>{t.qq.title}</span>
        <span className="message-status" data-state={snapshot.status} role="status" aria-label={t.qq.status[snapshot.status]} />
        <input type="checkbox" role="switch" aria-label={t.qq.receive} checked={snapshot.enabled} disabled={busy} onChange={(event) => void setEnabled(event.currentTarget.checked)} />
      </label>}
      {snapshot.enabled && (needsAccess || snapshot.status === "error" || snapshot.error || actionError) && <div className="qq-panel__actions">
        {snapshot.status === "permissionRequired" && <button className="message-action" type="button" aria-label={t.qq.allowLabel} disabled={busy} onClick={() => void requestAccess()}><KeyRound size={14} strokeWidth={1.8} />{t.qq.grant}</button>}
        {(snapshot.status === "permissionDenied" || snapshot.error || actionError) && <button className="icon-button" type="button" aria-label={t.qq.settings} disabled={busy} onClick={() => void openSettings()}><Settings2 size={16} strokeWidth={1.8} /></button>}
        {snapshot.status === "error" && <button className="icon-button" type="button" aria-label={t.qq.retryLabel} disabled={busy} onClick={() => void requestAccess()}><KeyRound size={16} strokeWidth={1.8} /></button>}
      </div>}
    </div>
    {!compact && needsAccess && <p className="qq-panel__error" role="alert">{t.qq.status[snapshot.status]}</p>}
    {!compact && (actionError || snapshot.error) && <p className="qq-panel__error" role="alert">{actionError || snapshot.error}</p>}
  </div>;
}

export function QQNotificationPanel({ controller, navigation }: { controller: QQNotificationsController; navigation: ReactNode }) {
  const { snapshot, busy, actionError, refresh, clear, openQQ } = controller;
  const t = useTranslation();
  const error = actionError || snapshot.error || (snapshot.status === "permissionRequired" || snapshot.status === "permissionDenied" ? t.qq.status[snapshot.status] : null);
  return (
    <section className="qq-panel" aria-label={t.qq.recent}>
      <header className="qq-panel__header">
        {navigation}
        <div className="qq-panel__toolbar">
          <QQNotificationControls controller={controller} compact />
          <button className="icon-button" type="button" aria-label={t.qq.open} disabled={busy} onClick={() => void openQQ()}><ArrowUpRight size={16} strokeWidth={1.8} /></button>
          <button className="icon-button" type="button" aria-label={t.qq.refresh} disabled={busy} onClick={() => void refresh()}><RefreshCw size={16} strokeWidth={1.8} /></button>
          <button className="icon-button" type="button" aria-label={t.qq.clear} disabled={busy || snapshot.items.length === 0} onClick={() => void clear()}><Trash2 size={16} strokeWidth={1.8} /></button>
        </div>
      </header>
      {error && <p className="qq-panel__error" role="alert">{error}</p>}
      <div className="qq-panel__list" role="list" aria-label={t.qq.list} aria-busy={busy}>
        {snapshot.items.length === 0 ? (
          <div className="qq-panel__empty" role="status"><span className="message-empty-icon"><MessageSourceIcon source="qq" size={28} /></span><span>{t.common.noMessages}</span></div>
        ) : snapshot.items.map((item) => (
          <article className="qq-panel__item" key={item.id} role="listitem">
            <button type="button" disabled={busy} onClick={() => void openQQ()} aria-label={t.qq.openNotification(item.title)}>
              <div className="qq-panel__item-heading"><strong>{item.title}</strong><time dateTime={new Date(item.createdAt).toISOString()}>{new Date(item.createdAt).toLocaleTimeString(t.localeTag, { hour: "2-digit", minute: "2-digit" })}</time></div>
              {item.body && <p>{item.body}</p>}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
