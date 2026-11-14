import { MessageCard } from "../MessageCard";
import { useTranslation } from "../../../i18n";
import type { ReactNode } from "react";
import { ArrowUpRight, CheckCheck, KeyRound, Power, RefreshCw, Settings2 } from "lucide-react";
import { useMessageCardExit } from "../useMessageCardExit";
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
  const displayed = useMessageCardExit(snapshot.items, snapshot.enabled);
  const error = actionError || snapshot.error || (snapshot.status === "permissionRequired" || snapshot.status === "permissionDenied" ? t.qq.status[snapshot.status] : null);
  return (
    <section className="qq-panel" aria-label={t.qq.recent}>
      <header className="qq-panel__header">
        {navigation}
        <div className="qq-panel__toolbar">
          <button className="icon-button" type="button" aria-label={t.messages.clearAll} title={t.messages.clearAll} disabled={busy || snapshot.items.length === 0} onClick={() => void clear()}><CheckCheck size={16} strokeWidth={1.5} absoluteStrokeWidth /></button>
          <QQNotificationControls controller={controller} compact />
          <button className="icon-button" type="button" aria-label={t.qq.open} disabled={busy} onClick={() => void openQQ()}><ArrowUpRight size={16} strokeWidth={1.8} /></button>
          <button className="icon-button" type="button" aria-label={t.qq.refresh} disabled={busy} onClick={() => void refresh()}><RefreshCw size={16} strokeWidth={1.8} /></button>
        </div>
      </header>
      {error && <p className="qq-panel__error" role="alert">{error}</p>}
      <div className="qq-panel__list message-card-list" role="list" aria-label={t.qq.list} aria-busy={busy}>
        {displayed.items.length === 0 ? (
          <div className="qq-panel__empty" role="status"><span className="message-empty-icon"><MessageSourceIcon source="qq" size={28} /></span><span>{t.common.noMessages}</span></div>
        ) : displayed.items.map((item) => (
          <MessageCard key={item.id} source="qq" messageId={item.id} name={item.title} timestamp={item.createdAt} body={item.body}
            leaving={displayed.leaving} disabled={busy || displayed.leaving} ariaLabel={t.qq.openNotification(item.title)} onOpen={() => void openQQ(item.title)} />
        ))}
      </div>
    </section>
  );
}
