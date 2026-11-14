import { useState } from "react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { useTranslation } from "../../i18n";
import { BalanceResultView } from "./BalanceResultView";
import type { BalanceAccountState } from "./types";

export function BalanceAccountCard({ row, enabled, busy, onEdit, onRefresh, onRemove }: {
  row: BalanceAccountState; enabled: boolean; busy: boolean;
  onEdit: () => void; onRefresh: () => void; onRemove: () => void;
}) {
  const t = useTranslation().settings.plugins.balance;
  const [confirmRemove, setConfirmRemove] = useState(false);
  const a = row.account;
  return <SettingsGroup title={a.name} footer={<>
    {row.updatedAt && <span>{t.updated} {new Date(row.updatedAt).toLocaleString()}</span>}
    {(!a.enabled || !a.intervalMinutes) && <span> · {t.paused}</span>}
  </>}>
    <SettingsRow title={t.templates[a.template]} description={a.baseUrl} control={<div className="api-balance-actions">
      <SettingsLinkButton disabled={busy || row.refreshing || !enabled} onClick={onRefresh}>{row.refreshing ? t.refreshing : t.refresh}</SettingsLinkButton>
      <SettingsLinkButton disabled={busy} onClick={onEdit}>{t.edit}</SettingsLinkButton>
    </div>} />
    <div className="api-balance-card-content">
      {enabled && a.enabled && row.warning && <p className="api-balance-error" role="alert">{t.lowBalance(a.name, String(row.warning.remaining), row.warning.unit, String(row.warning.threshold))}</p>}
      {row.result ? <BalanceResultView result={row.result} /> : <p className="api-balance-muted">{t.noData}</p>}
      {row.error && <p className="api-balance-error" role="alert">{row.error}</p>}
      <div className="api-balance-actions">
        <SettingsLinkButton tone="danger" disabled={busy} onClick={() => { if (confirmRemove) onRemove(); else setConfirmRemove(true); }}>{confirmRemove ? t.confirmRemove : t.remove}</SettingsLinkButton>
        {confirmRemove && <SettingsLinkButton onClick={() => setConfirmRemove(false)}>{t.cancel}</SettingsLinkButton>}
      </div>
    </div>
  </SettingsGroup>;
}
