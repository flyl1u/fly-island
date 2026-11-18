import { useState } from "react";
import { MAIL_OTP_ENABLED } from "../../features/releaseFlags.ts";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { SettingsSliderRow } from "../../components/settings/SettingsSliderRow";
import { MESSAGE_EXPAND_MAX_HEIGHT, MESSAGE_EXPAND_MAX_WIDTH, MESSAGE_EXPAND_SECONDS, MESSAGE_PREVIEW_SECONDS } from "../../features/appearance/settingsLimits";
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
  const { snapshot: wechat, actionError, setEnabled, setPreviewEnabled, setHideMinimizedTaskbar } = wechatReminders;
  const wechatHint = wechat.previewEnabled && wechat.enabled
    ? t.wechat.previewStatus[wechat.previewStatus] || labels.wechatHint
    : labels.wechatHint;

  return (
    <>
      <SettingsGroup title={labels.previewTitle}>
        <SettingsSliderRow title={labels.previewSeconds} value={settings.messagePreviewSeconds}
          min={MESSAGE_PREVIEW_SECONDS.min} max={MESSAGE_PREVIEW_SECONDS.max} step={MESSAGE_PREVIEW_SECONDS.step}
          format={(value) => `${value} ${t.settings.expand.secondsUnit}`}
          defaultValue={MESSAGE_PREVIEW_SECONDS.default} resetLabel={t.settings.layout.resetToDefault}
          onChange={(messagePreviewSeconds) => onSettingsChange({ ...settings, messagePreviewSeconds })} />
        <NoticeRows settings={settings} onSettingsChange={onSettingsChange} />
      </SettingsGroup>
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
        {wechat.enabled && wechat.previewEnabled && (
          <SettingsToggleRow
            title={t.wechat.hideMinimizedTaskbar}
            description={t.wechat.hideMinimizedTaskbarHint}
            checked={wechat.hideMinimizedTaskbar}
            onChange={(hidden) => void setHideMinimizedTaskbar(hidden)}
          />
        )}
      </SettingsGroup>
      <MailGroups settings={settings} onSettingsChange={onSettingsChange} />
    </>
  );
}

/** Adaptive previews (v3.2.6): their size limits and seconds. Game-mode previews sit beside game mode. */
function NoticeRows({ settings, onSettingsChange }: { settings: IslandSettings; onSettingsChange: (settings: IslandSettings) => void }) {
  const t = useTranslation();
  const labels = t.settings.messageSources;
  const reset = t.settings.layout.resetToDefault;
  const seconds = (value: number) => `${value} ${t.settings.expand.secondsUnit}`;
  const pixels = (value: number) => `${value} px`;
  return (
    <>
      <SettingsToggleRow title={labels.autoExpand} description={labels.autoExpandHint} checked={settings.messageAutoExpand}
        onChange={(messageAutoExpand) => onSettingsChange({ ...settings, messageAutoExpand })} />
      {settings.messageAutoExpand && <>
        <SettingsSliderRow indent title={labels.expandMaxWidth} value={settings.messageExpandMaxWidth} min={MESSAGE_EXPAND_MAX_WIDTH.min}
          max={MESSAGE_EXPAND_MAX_WIDTH.max} step={MESSAGE_EXPAND_MAX_WIDTH.step} format={pixels} defaultValue={MESSAGE_EXPAND_MAX_WIDTH.default}
          resetLabel={reset} onChange={(messageExpandMaxWidth) => onSettingsChange({ ...settings, messageExpandMaxWidth })} />
        <SettingsSliderRow indent title={labels.expandMaxHeight} value={settings.messageExpandMaxHeight} min={MESSAGE_EXPAND_MAX_HEIGHT.min}
          max={MESSAGE_EXPAND_MAX_HEIGHT.max} step={MESSAGE_EXPAND_MAX_HEIGHT.step} format={pixels} defaultValue={MESSAGE_EXPAND_MAX_HEIGHT.default}
          resetLabel={reset} onChange={(messageExpandMaxHeight) => onSettingsChange({ ...settings, messageExpandMaxHeight })} />
        <SettingsSliderRow indent title={labels.expandSeconds} value={settings.messageExpandSeconds} min={MESSAGE_EXPAND_SECONDS.min}
          max={MESSAGE_EXPAND_SECONDS.max} step={MESSAGE_EXPAND_SECONDS.step} format={seconds} defaultValue={MESSAGE_EXPAND_SECONDS.default}
          resetLabel={reset} onChange={(messageExpandSeconds) => onSettingsChange({ ...settings, messageExpandSeconds })} />
      </>}
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
        {MAIL_OTP_ENABLED && settings.mailEnabled && <SettingsToggleRow
          title={t.settings.messageSources.autoCopyOtp}
          checked={settings.autoCopyOtp}
          onChange={(autoCopyOtp) => onSettingsChange({ ...settings, autoCopyOtp })}
        />}
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
