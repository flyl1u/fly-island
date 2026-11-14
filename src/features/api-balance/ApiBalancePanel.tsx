import { useRef, useState } from "react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { useTranslation } from "../../i18n";
import * as api from "./api";
import { BalanceAccountCard } from "./BalanceAccountCard";
import { BalanceAccountForm, type BalanceDraft } from "./BalanceAccountForm";
import { BalanceResultView } from "./BalanceResultView";
import { exportBalanceAccounts, MAX_IMPORT_BYTES, parseBalanceImport, validateAccount } from "./importExport";
import { emptySecrets, newAccount } from "./types";
import type { BalanceAccountState, BalanceResult, ImportEntry } from "./types";
import { useApiBalance } from "./useApiBalance";
import "./ApiBalancePanel.css";

export function ApiBalancePanel() {
  const t = useTranslation().settings.plugins.balance;
  const model = useApiBalance();
  const { snapshot, busy, perform, change } = model;
  const fileInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<BalanceDraft | null>(null);
  const [preview, setPreview] = useState<ImportEntry[]>([]);
  const [includeScripts, setIncludeScripts] = useState(false);
  const [testResult, setTestResult] = useState<BalanceResult | null>(null);
  const edited = draft ? snapshot.accounts.find(r => r.account.id === draft.account.id) : undefined;
  const updateDraft = (next: BalanceDraft) => { setDraft(next); setTestResult(null); };
  const edit = (row: BalanceAccountState) => void perform(async () => {
    const code = row.codeConfigured ? await api.readBalanceScript(row.account.id) : "";
    updateDraft({ account: { ...row.account }, secrets: { ...emptySecrets(), code } });
  });
  const save = () => { if (draft) void perform(async () => {
    validateAccount(draft.account);
    return api.saveBalanceAccount(draft.account, draft.secrets);
  }, next => { model.accept(next); setDraft(null); setTestResult(null); }); };
  const test = () => { if (draft) void perform(async () => {
    validateAccount(draft.account); return api.testBalance(draft.account, draft.secrets);
  }, setTestResult); };
  const importFile = async (file: File) => {
    await perform(async () => {
      if (file.size > MAX_IMPORT_BYTES) throw new Error("fileTooLarge");
      return parseBalanceImport(await file.text(), file.name);
    }, setPreview);
  };
  const exportFile = () => void perform(async () => {
    const scripts = new Map<string, string>();
    if (includeScripts) for (const row of snapshot.accounts) if (row.codeConfigured) scripts.set(row.account.id, await api.readBalanceScript(row.account.id));
    const url = URL.createObjectURL(new Blob([exportBalanceAccounts(snapshot.accounts, scripts)], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "api-balance.flyisland-balance.json";
    document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const errorKey = model.error.replace(/^Error: /, "");
  return <section className="settings-section settings-section--list api-balance-panel">
    <SettingsGroup title={t.title} footer={t.description}>
      <SettingsToggleRow title={t.enabled} checked={snapshot.enabled} onChange={enabled => { if (!busy) void change(() => api.enableBalance(enabled)); }} />
      <SettingsRow title={t.title} control={<div className="api-balance-actions">
        <SettingsLinkButton disabled={busy || snapshot.accounts.length >= 50} onClick={() => { updateDraft({ account: newAccount(crypto.randomUUID()), secrets: emptySecrets() }); setPreview([]); }}>{t.add}</SettingsLinkButton>
        <SettingsLinkButton disabled={busy} onClick={() => fileInput.current?.click()}>{t.import}</SettingsLinkButton>
        <SettingsLinkButton disabled={busy || !snapshot.accounts.length} onClick={exportFile}>{t.export}</SettingsLinkButton>
      </div>} />
      <SettingsToggleRow title={t.exportScripts} checked={includeScripts} onChange={setIncludeScripts} />
    </SettingsGroup>
    <input ref={fileInput} className="api-balance-file" aria-label={t.import} type="file" accept=".json,.flyisland-balance.json,.js,application/json,text/javascript" onChange={e => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ""; if (file) void importFile(file); }} />
    {model.loading && <p className="api-balance-muted">{t.loading}</p>}
    {model.error && <p className="api-balance-error" role="alert">{t.errors[errorKey] ?? model.error}</p>}
    {preview.length > 0 && <SettingsGroup title={t.importPreview} footer={t.importHint}>
      <ul className="api-balance-import-preview">{preview.map(({ account }) => <li key={account.id}>{account.name} · {t.templates[account.template]}{account.provider && ` · ${account.provider}`}</li>)}</ul>
      <div className="api-balance-actions api-balance-card-content">
        <SettingsLinkButton disabled={busy} onClick={() => { void change(() => api.importBalanceAccounts(preview)).then(ok => { if (ok) setPreview([]); }); }}>{t.confirmImport} ({preview.length})</SettingsLinkButton>
        <SettingsLinkButton disabled={busy} onClick={() => setPreview([])}>{t.cancel}</SettingsLinkButton>
      </div>
    </SettingsGroup>}
    {draft && <div className="api-balance-editor">
      <fieldset disabled={busy} className="api-balance-fieldset">
        <BalanceAccountForm draft={draft} stored={Boolean(edited?.hasCredentials)} onChange={updateDraft} />
      </fieldset>
      <div className="api-balance-actions">
        <SettingsLinkButton disabled={busy} onClick={save}>{t.save}</SettingsLinkButton>
        <SettingsLinkButton disabled={busy} onClick={test}>{busy ? t.refreshing : t.test}</SettingsLinkButton>
        <SettingsLinkButton disabled={busy} onClick={() => { setDraft(null); setTestResult(null); }}>{t.cancel}</SettingsLinkButton>
      </div>
      {testResult && <SettingsGroup title={t.testPassed}><div className="api-balance-card-content"><BalanceResultView result={testResult} /></div></SettingsGroup>}
    </div>}
    {!snapshot.accounts.length && !draft && !model.loading && <p className="api-balance-muted">{t.noAccounts}</p>}
    {snapshot.accounts.map(row => <BalanceAccountCard key={row.account.id} row={row} busy={busy} enabled={snapshot.enabled}
      onEdit={() => edit(row)} onRefresh={() => { void change(() => api.refreshBalance(row.account.id)); }} onRemove={() => { void change(() => api.removeBalanceAccount(row.account.id)); }} />)}
    <p className="api-balance-muted">{t.importHint}</p>
  </section>;
}
