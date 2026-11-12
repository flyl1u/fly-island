import { useState } from "react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import type { IslandSettings } from "../../features/appearance/types";
import { MailAccountList } from "../../features/messages/mail/MailAccountList";
import { MailConnectForm } from "../../features/messages/mail/MailConnectForm";
import { MAX_MAIL_ACCOUNTS } from "../../features/messages/mail/mailAccounts";
import { loadMailAccounts } from "../../features/messages/mail/storage";
import { useMailAccounts } from "../../features/messages/mail/useMailAccounts";
import type { QQNotificationsController } from "../../features/messages/qq-notifications/QQNotifications";
import type { WeChatRemindersController } from "../../features/messages/wechat/WeChatReminders";
import { useTranslation } from "../../i18n";
import "./MessagesSettingsPage.css";

/**
 * Messages: QQ, WeChat and Mail on one page (they were three). QQ and WeChat have a receive
 * switch each; Mail its module switch, the mailboxes, and the form that adds or re-authorizes one.
 */
export function MessagesSettingsPage({
  settings,
  qqNotifications,
  wechatReminders,
  onSettingsChange,
}: {
  settings: IslandSettings;
  qqNotifications: QQNotificationsController;
  wechatReminders: WeChatRemindersController;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();
  const labels = t.settings.messageSources;
  const { snapshot: wechat, actionError, setEnabled, setPreviewEnabled } = wechatReminders;
  const wechatHint = wechat.previewEnabled && wechat.enabled
    ? t.wechat.previewStatus[wechat.previewStatus] || labels.wechatHint
    : labels.wechatHint;

  return (
    <>
      <QQGroup controller={qqNotifications} title={labels.qqTitle} hint={labels.qqHint} />
      <SettingsGroup title={labels.wechatTitle} footer={<Problem error={actionError || wechat.error} hint={wechatHint} />}>
        <SettingsToggleRow
          title={t.wechat.receive}
          checked={wechat.enabled}
          onChange={(enabled) => void setEnabled(enabled)}
        />
        {wechat.enabled && (
          <SettingsToggleRow
            title={t.wechat.showPreview}
            description={
              <>{t.wechat.previewHint}<span className="messages-settings__wechat-risk">{t.wechat.previewRisk}</span></>
            }
            checked={wechat.previewEnabled}
            onChange={(enabled) => void setPreviewEnabled(enabled)}
          />
        )}
      </SettingsGroup>
      <MailGroups settings={settings} onSettingsChange={onSettingsChange} />
    </>
  );
}

/** A group's footer: what went wrong, else the hint. */
function Problem({ error, hint }: { error: string | null | undefined; hint: string }) {
  return error ? <span className="messages-settings__error" role="alert">{error}</span> : <>{hint}</>;
}

function QQGroup({ controller, title, hint }: { controller: QQNotificationsController; title: string; hint: string }) {
  const t = useTranslation();
  const { snapshot, busy, actionError, setEnabled, requestAccess, openSettings } = controller;
  const needsAccess = snapshot.enabled && (snapshot.status === "permissionRequired" || snapshot.status === "permissionDenied");
  const error = actionError || snapshot.error || (needsAccess ? t.qq.status[snapshot.status] : null);

  return (
    <SettingsGroup title={title} footer={<Problem error={error} hint={hint} />}>
      <SettingsToggleRow title={t.qq.receive} checked={snapshot.enabled} onChange={(enabled) => void setEnabled(enabled)} />
      {needsAccess && (
        <SettingsRow
          title={t.qq.allowLabel}
          indent
          control={
            snapshot.status === "permissionRequired" ? (
              <SettingsLinkButton disabled={busy} onClick={() => void requestAccess()}>{t.qq.grant}</SettingsLinkButton>
            ) : (
              <SettingsLinkButton disabled={busy} onClick={() => void openSettings()}>{t.qq.settings}</SettingsLinkButton>
            )
          }
        />
      )}
    </SettingsGroup>
  );
}

function MailGroups({ settings, onSettingsChange }: { settings: IslandSettings; onSettingsChange: (settings: IslandSettings) => void }) {
  const t = useTranslation();
  // The island reconnects the saved mailboxes at startup; this page only follows them.
  const { mailboxes, busy, actionError, connect, setEnabled, disconnect, openHelp } = useMailAccounts({ restore: false });
  const [reauthorizing, setReauthorizing] = useState<string | null>(null);
  const hosts = Object.fromEntries(loadMailAccounts().map((account) => [account.email, account.host]));
  const full = mailboxes.length >= MAX_MAIL_ACCOUNTS;
  const target = (reauthorizing ? mailboxes.find((mailbox) => mailbox.email === reauthorizing) : undefined)?.email ?? null;

  return (
    <>
      <SettingsGroup title={t.settings.categories.mail} footer={settings.mailEnabled ? <Problem error={actionError} hint={t.mail.accountsHint} /> : undefined}>
        <SettingsToggleRow
          title={t.settings.modules.mail}
          description={t.settings.modules.hint}
          checked={settings.mailEnabled}
          onChange={(mailEnabled) => onSettingsChange({ ...settings, mailEnabled })}
        />
        {settings.mailEnabled && mailboxes.length > 0 && (
          <div className="messages-settings__mailboxes">
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
          </div>
        )}
      </SettingsGroup>
      {settings.mailEnabled && (
        <SettingsGroup title={target ? t.mail.reauthorizeTitle(target) : t.mail.addTitle} footer={full && !target ? t.mail.limitReached(MAX_MAIL_ACCOUNTS) : undefined}>
          {full && !target ? null : (
            <div className="messages-settings__connect">
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
            </div>
          )}
        </SettingsGroup>
      )}
    </>
  );
}
