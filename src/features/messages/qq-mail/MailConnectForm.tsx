import { useEffect, useState } from "react";
import { ArrowRight, CircleHelp, LoaderCircle } from "lucide-react";
import { useTranslation } from "../../../i18n";
import { hasQQMailHelp } from "./mailDomain";
import "./MailSettings.css";

/**
 * Adds a mailbox, or, given `reauthorizing`, re-enters the code of a known one; its
 * address is then fixed and its saved IMAP server kept.
 */
export function MailConnectForm({ reauthorizing, busy, onConnect, onHelp, onCancel }: {
  reauthorizing: string | null;
  busy: boolean;
  onConnect: (email: string, authorizationCode: string, host?: string) => Promise<boolean>;
  onHelp: () => void;
  onCancel?: () => void;
}) {
  const t = useTranslation();
  const [email, setEmail] = useState(reauthorizing ?? "");
  const [authorizationCode, setAuthorizationCode] = useState("");
  const [host, setHost] = useState("");

  useEffect(() => { setEmail(reauthorizing ?? ""); setAuthorizationCode(""); setHost(""); }, [reauthorizing]);

  return (
    <form className="mail-settings__form" onSubmit={(event) => {
      event.preventDefault();
      void onConnect(email, authorizationCode, reauthorizing ? undefined : host).then((connected) => {
        if (!connected) return;
        setAuthorizationCode("");
        if (!reauthorizing) { setEmail(""); setHost(""); }
      });
    }}>
      <label className="mail-settings__row">
        <span>{t.mail.email}</span>
        <input type="email" autoComplete="username" placeholder={t.mail.emailPlaceholder} required maxLength={80} value={email} disabled={busy || reauthorizing !== null} onChange={(event) => setEmail(event.currentTarget.value)} />
      </label>
      <label className="mail-settings__row">
        <span>{t.mail.authorizationCode}</span>
        <input type="password" autoComplete="off" placeholder={t.mail.authorizationPlaceholder} required maxLength={256} value={authorizationCode} disabled={busy} onChange={(event) => setAuthorizationCode(event.currentTarget.value)} />
      </label>
      {reauthorizing === null && (
        <label className="mail-settings__row">
          <span>{t.mail.imapHost}</span>
          <input type="text" autoComplete="off" spellCheck={false} placeholder={t.mail.imapHostPlaceholder} maxLength={253} value={host} disabled={busy} onChange={(event) => setHost(event.currentTarget.value)} />
        </label>
      )}
      <div className="mail-settings__buttons">
        {hasQQMailHelp(email) && (
          <button className="mail-settings__button" type="button" aria-label={t.mail.helpLabel} onClick={onHelp}>
            <CircleHelp size={13} strokeWidth={2} aria-hidden="true" />{t.mail.help}
          </button>
        )}
        {onCancel && <button className="mail-settings__button" type="button" disabled={busy} onClick={onCancel}>{t.mail.cancel}</button>}
        <button className="mail-settings__button mail-settings__button--primary" type="submit" disabled={busy || !email.trim() || !authorizationCode.trim()}>
          {busy ? <LoaderCircle size={13} strokeWidth={2} className="mail-settings__spinning" aria-hidden="true" /> : <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />}
          {busy ? t.common.connecting : t.mail.connect}
        </button>
      </div>
    </form>
  );
}
