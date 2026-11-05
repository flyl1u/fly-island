import { useState } from "react";
import type { IslandSettings } from "../../features/appearance/types";
import { MailAccountList } from "../../features/messages/mail/MailAccountList";
import { MailConnectForm } from "../../features/messages/mail/MailConnectForm";
import { MAX_MAIL_ACCOUNTS } from "../../features/messages/mail/mailAccounts";
import { loadMailAccounts } from "../../features/messages/mail/storage";
import { useMailAccounts } from "../../features/messages/mail/useMailAccounts";
import { useTranslation } from "../../i18n";
import { ModuleSwitchSection } from "./ModuleSwitchSection";

/** Mail: the module switch and the mailboxes, which are added and re-authorized here. */
export function MailSettingsPage({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();
  // The island reconnects the saved mailboxes at startup; this page only follows them.
  const accounts = useMailAccounts({ restore: false });
  const { mailboxes, busy, actionError, connect, setEnabled, disconnect, openHelp } = accounts;
  const [reauthorizing, setReauthorizing] = useState<string | null>(null);
  const hosts = Object.fromEntries(loadMailAccounts().map((account) => [account.email, account.host]));
  const full = mailboxes.length >= MAX_MAIL_ACCOUNTS;
  const reauthorizingBox = reauthorizing ? mailboxes.find((mailbox) => mailbox.email === reauthorizing) : undefined;
  const target = reauthorizingBox?.email ?? null;

  return (
    <>
      <ModuleSwitchSection
        label={t.settings.modules.mail}
        checked={settings.mailEnabled}
        onChange={(mailEnabled) => onSettingsChange({ ...settings, mailEnabled })}
      />
      {settings.mailEnabled && (
        <>
          <section className="settings-section settings-section--mail-accounts">
            <div className="settings-section__header"><span>{t.mail.accountsTitle}</span></div>
            <MailAccountList
              mailboxes={mailboxes}
              hosts={hosts}
              busy={busy}
              onSetEnabled={(email, enabled) => void setEnabled(email, enabled)}
              onReauthorize={setReauthorizing}
              onDisconnect={(email) => {
                if (email === target) setReauthorizing(null);
                void disconnect(email);
              }}
            />
            {actionError && <p className="mail-settings__error" role="alert">{actionError}</p>}
            <p className="settings-section__hint">{t.mail.accountsHint}</p>
          </section>
          <section className="settings-section settings-section--mail-connect">
            <div className="settings-section__header">
              <span>{target ? t.mail.reauthorizeTitle(target) : t.mail.addTitle}</span>
            </div>
            {full && !target ? (
              <p className="settings-section__hint">{t.mail.limitReached(MAX_MAIL_ACCOUNTS)}</p>
            ) : (
              <MailConnectForm
                reauthorizing={target}
                busy={busy}
                onConnect={async (email, code, host) => {
                  const connected = await connect(email, code, host);
                  if (connected) setReauthorizing(null);
                  return connected;
                }}
                onHelp={() => void openHelp()}
                onCancel={target ? () => setReauthorizing(null) : undefined}
              />
            )}
          </section>
        </>
      )}
    </>
  );
}
