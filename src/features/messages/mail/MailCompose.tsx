import { useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { ArrowLeft, LoaderCircle, Send } from "lucide-react";
import { useTranslation } from "../../../i18n";
import { sendMail } from "./api";
import { splitRecipients, type ComposeDraft } from "./compose";

/** Writes plain-text mail from `account`; a draft with `replyTo` answers that message. */
export function MailCompose({ account, draft, onClose }: { account: string; draft: ComposeDraft; onClose: () => void }) {
  const t = useTranslation();
  const [to, setTo] = useState(draft.to);
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!isTauri()) { setError(t.mail.desktopConnect); return; }
    setSending(true);
    setError(null);
    try {
      await sendMail(account, { to: splitRecipients(to), cc: splitRecipients(cc), subject, body }, draft.replyTo);
      onClose();
    } catch (failure) {
      setError(String(failure));
      setSending(false);
    }
  };

  return (
    <section className="qq-panel qq-mail-panel qq-mail-compose" aria-label={draft.replyTo ? t.mail.reply : t.mail.compose}>
      <header className="qq-panel__header">
        <button className="message-action qq-mail-back" type="button" disabled={sending} onClick={onClose}><ArrowLeft size={15} strokeWidth={1.8} />{t.mail.cancel}</button>
        <span className="qq-mail-compose__from" title={account}>{t.mail.from(account)}</span>
        <button className="message-action qq-mail-connect" type="button" disabled={sending || splitRecipients(to).length === 0} onClick={() => void send()}>
          {sending ? <LoaderCircle size={14} strokeWidth={1.8} className="qq-mail-spinning" /> : <Send size={14} strokeWidth={1.8} />}
          {sending ? t.mail.sending : t.mail.send}
        </button>
      </header>
      {error ? <p className="qq-panel__error" role="alert">{error}</p> : null}
      <div className="qq-mail-compose__fields">
        <label><span>{t.mail.to}</span><input type="text" autoComplete="email" spellCheck={false} value={to} disabled={sending} placeholder={t.mail.recipientsPlaceholder} onChange={(event) => setTo(event.currentTarget.value)} /></label>
        <label><span>{t.mail.cc}</span><input type="text" autoComplete="email" spellCheck={false} value={cc} disabled={sending} onChange={(event) => setCc(event.currentTarget.value)} /></label>
        <label><span>{t.mail.subject}</span><input type="text" value={subject} maxLength={500} disabled={sending} onChange={(event) => setSubject(event.currentTarget.value)} /></label>
        <textarea aria-label={t.mail.messageBody} value={body} disabled={sending} placeholder={t.mail.bodyPlaceholder} onChange={(event) => setBody(event.currentTarget.value)} />
      </div>
    </section>
  );
}
