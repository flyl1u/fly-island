import { Plus } from "lucide-react";
import { useTranslation } from "../../../i18n";
import { mailBadgeCount } from "../messagePreview";
import type { MailSnapshot } from "./api";
import { MAX_MAIL_ACCOUNTS } from "./mailAccounts";

/** One tab per mailbox (status, address, unread count) and a "+" tab for the connect form. */
export function MailAccountTabs({ mailboxes, selected, adding, busy, onSelect, onAdd }: {
  mailboxes: MailSnapshot[];
  selected: string | null;
  adding: boolean;
  busy: boolean;
  onSelect: (email: string) => void;
  onAdd: () => void;
}) {
  const t = useTranslation();
  return (
    <div className="qq-mail-accounts" role="tablist" aria-label={t.mail.accounts}>
      {mailboxes.map((mailbox) => {
        if (!mailbox.email) return null;
        const email = mailbox.email;
        const unread = mailbox.enabled ? mailbox.unreadCount ?? 0 : 0;
        return (
          <button key={email} type="button" role="tab" className="qq-mail-account" aria-selected={!adding && email === selected}
            title={`${email} · ${t.mail.status[mailbox.status]}`} onClick={() => onSelect(email)}>
            <span className="message-status" data-state={mailbox.status} aria-label={t.mail.status[mailbox.status]} />
            <span className="qq-mail-account__email">{email}</span>
            {unread > 0 && <span className="message-source-count">{mailBadgeCount(unread)}</span>}
          </button>
        );
      })}
      {mailboxes.length < MAX_MAIL_ACCOUNTS && (
        <button type="button" role="tab" className="qq-mail-account qq-mail-account--add" aria-selected={adding}
          title={t.mail.addAccount} aria-label={t.mail.addAccount} disabled={busy} onClick={onAdd}>
          <Plus size={13} strokeWidth={1.8} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
