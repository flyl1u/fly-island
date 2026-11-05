import { useState } from "react";
import { KeyRound, Pause, Play, Unplug } from "lucide-react";
import { useTranslation } from "../../../i18n";
import type { MailSnapshot } from "./api";
import "./MailSettings.css";

/** The settings page's mailboxes: status, unread count, and pause, re-authorize, disconnect. */
export function MailAccountList({ mailboxes, hosts, busy, onSetEnabled, onReauthorize, onDisconnect }: {
  mailboxes: MailSnapshot[];
  /** The IMAP server saved for each address; empty means imap.<domain>. */
  hosts: Record<string, string>;
  busy: boolean;
  onSetEnabled: (email: string, enabled: boolean) => void;
  onReauthorize: (email: string) => void;
  onDisconnect: (email: string) => void;
}) {
  const t = useTranslation();
  // Disconnecting deletes the saved code, which has to be generated again on the webmail
  // site, so it takes a second click on the same row.
  const [confirming, setConfirming] = useState<string | null>(null);
  if (mailboxes.length === 0) return <p className="mail-settings__empty">{t.mail.noMailbox}</p>;

  return (
    <ul className="mail-settings__list" aria-label={t.mail.accounts}>
      {mailboxes.map((mailbox) => {
        if (!mailbox.email) return null;
        const email = mailbox.email;
        const needsCode = mailbox.status === "authRequired";
        const unread = mailbox.enabled && mailbox.unreadCount ? ` · ${t.mail.unread(mailbox.unreadCount)}` : "";
        const host = hosts[email] || t.mail.defaultHost;
        return (
          <li className="mail-settings__account" key={email}>
            <span className="message-status" data-state={mailbox.status} role="status" aria-label={t.mail.status[mailbox.status]} />
            <span className="mail-settings__address">
              <strong title={email}>{email}</strong>
              <small>{t.mail.status[mailbox.status]}{unread} · {host}</small>
              {mailbox.error && <small className="mail-settings__account-error">{mailbox.error}</small>}
            </span>
            <span className="mail-settings__actions">
              {needsCode ? (
                <button className="mail-settings__button mail-settings__button--primary" type="button" disabled={busy} onClick={() => onReauthorize(email)}>
                  <KeyRound size={13} strokeWidth={2} aria-hidden="true" />{t.mail.reauthorize}
                </button>
              ) : mailbox.configured && (
                <button className="mail-settings__button" type="button" disabled={busy} aria-label={`${mailbox.enabled ? t.mail.pause : t.mail.resume} · ${email}`} onClick={() => onSetEnabled(email, !mailbox.enabled)}>
                  {mailbox.enabled ? <Pause size={13} strokeWidth={2} aria-hidden="true" /> : <Play size={13} strokeWidth={2} aria-hidden="true" />}
                  {mailbox.enabled ? t.mail.pauseShort : t.mail.resumeShort}
                </button>
              )}
              {confirming === email ? (
                <>
                  <button className="mail-settings__button mail-settings__button--danger" type="button" disabled={busy} aria-label={`${t.mail.confirmDisconnect} · ${email}`} onClick={() => { setConfirming(null); onDisconnect(email); }}>
                    <Unplug size={13} strokeWidth={2} aria-hidden="true" />{t.mail.confirmDisconnect}
                  </button>
                  <button className="mail-settings__button" type="button" onClick={() => setConfirming(null)}>{t.mail.cancel}</button>
                </>
              ) : (
                <button className="mail-settings__button" type="button" disabled={busy} title={t.mail.disconnectLabel} aria-label={`${t.mail.disconnectLabel} · ${email}`} onClick={() => setConfirming(email)}>
                  <Unplug size={13} strokeWidth={2} aria-hidden="true" />{t.mail.disconnectShort}
                </button>
              )}
            </span>
            {confirming === email && <small className="mail-settings__confirm" role="alert">{t.mail.confirmDisconnectHint}</small>}
          </li>
        );
      })}
    </ul>
  );
}
