import { useMemo, useState, type ReactNode } from "react";
import { CheckCheck, Power } from "lucide-react";
import { useTranslation } from "../../../i18n";
import { MessageCard } from "../MessageCard";
import { MessageSourceIcon } from "../MessageSourceIcon";
import { useMessageCardExit } from "../useMessageCardExit";
import type { OfficeSource } from "../messagePreview";
import { clearOfficeClient, openOfficeClient, useOfficeImEnabled, useOfficeImSnapshot } from "./useOfficeIm";
import "../wechat/WeChatReminders.css";

/**
 * A DingTalk / Feishu / WeCom page, laid out like the WeChat one: a content-free reminder card
 * while the client flashes, otherwise the big icon that opens the client.
 */
export function OfficeImPanel({ source, navigation }: { source: OfficeSource; navigation: ReactNode }) {
  const t = useTranslation();
  const name = t.messages.sourceLabels[source];
  const state = useOfficeImSnapshot()[source];
  const [, setEnabled] = useOfficeImEnabled();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = state.enabled && state.pending;
  const cards = useMemo(() => pending ? [{ id: `${source}-${state.lastAttentionAt ?? 0}`, receivedAt: state.lastAttentionAt ?? Date.now() }] : [],
    [pending, source, state.lastAttentionAt]);
  const displayed = useMessageCardExit(cards, state.enabled);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await action(); } catch (reason) { setError(String(reason)); } finally { setBusy(false); }
  };
  const open = () => void run(() => openOfficeClient(source));
  const label = state.status === "listening" ? pending ? t.messages.newReminder : t.messages.office.noReminders : t.messages.office.status[state.status];
  return <section className="qq-panel" aria-label={t.messages.office.reminders(name)}>
    <header className="qq-panel__header">
      {navigation}
      <div className="qq-panel__toolbar">
        <button className="icon-button" type="button" aria-label={t.messages.clearAll} title={t.messages.clearAll}
          disabled={busy || !pending} onClick={() => void run(() => clearOfficeClient(source))}><CheckCheck size={16} strokeWidth={1.5} absoluteStrokeWidth /></button>
        <div className="qq-panel__controls qq-panel__controls--compact">
          <button className="icon-button message-receiver-toggle" type="button" role="switch" aria-checked={state.enabled}
            aria-label={t.messages.office.receive(name)} disabled={busy} onClick={() => setEnabled(source, !state.enabled)}><Power size={15} strokeWidth={1.8} /></button>
        </div>
      </div>
    </header>
    {(error || state.error) && <p className="qq-panel__error" role="alert">{error || state.error}</p>}
    {displayed.items.length > 0 ? <div className="qq-panel__list message-card-list" role="list">
      {displayed.items.map(({ id, receivedAt }) => <MessageCard key={id} source={source} messageId={id} name={name} timestamp={receivedAt}
        body={t.messages.newReminder} muted leaving={displayed.leaving} disabled={busy || displayed.leaving}
        ariaLabel={t.messages.office.open(name)} onOpen={open} />)}
    </div> : <div className="qq-panel__empty">
      <button className={`wechat-launch${pending ? " wechat-launch--pending" : ""}`} type="button"
        aria-label={`${label}，${t.messages.office.clickToOpen}`} disabled={busy} onClick={open}>
        <span className="wechat-launch__icon"><MessageSourceIcon source={source} size={30} /></span>
        <span className="wechat-launch__state" role="status">{label}</span>
        <span className="wechat-launch__hint">{t.messages.office.clickToOpen}</span>
      </button>
    </div>}
  </section>;
}
