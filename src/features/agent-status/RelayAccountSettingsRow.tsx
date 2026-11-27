import { useEffect, useState } from "react";
import { SettingsDialog } from "../../components/settings/SettingsDialog";
import { SettingsInput } from "../../components/settings/SettingsInput";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSelect } from "../../components/settings/SettingsSelect";
import { useTranslation } from "../../i18n";
import {
  checkRelayAccount, deleteRelayAccount, getRelayAccounts, notifyRelayUsageChanged, saveRelayAccount,
  type RelayAccountInput, type RelayAccountView, type RelayAdapter,
} from "./api";
import "./RelayAccountSettingsRow.css";

const ADAPTERS: RelayAdapter[] = ["newapi-account", "newapi-token", "sub2api", "custom"];

type Draft = RelayAccountInput;

function draft(account?: RelayAccountView): Draft {
  if (!account) return { id: "", name: "", adapter: "newapi-account", baseUrl: "" };
  return {
    id: account.id,
    name: account.name,
    adapter: account.adapter,
    baseUrl: account.baseUrl,
    endpointPath: account.endpointPath ?? undefined,
    remainingPath: account.remainingPath ?? undefined,
    usedPath: account.usedPath ?? undefined,
    totalPath: account.totalPath ?? undefined,
    authMode: account.authMode ?? undefined,
    currency: account.currency ?? undefined,
    divisor: account.divisor ?? undefined,
  };
}

/** Settings for the third-party relay accounts behind the quota rings. */
export function RelayAccountSettingsRow({ polling }: { polling: boolean }) {
  const text = useTranslation().settings.agent.relayAccounts;
  const [accounts, setAccounts] = useState<RelayAccountView[] | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void getRelayAccounts().then((next) => { if (active) setAccounts(next); })
      .catch(() => { if (active) setAccounts([]); });
    return () => { active = false; };
  }, [open]);

  const summary = accounts === null ? "" : accounts.length ? text.count(accounts.length) : text.empty;
  const failure = (error: unknown) => {
    const parts = String(error).replace(/^relay:/, "").split(":");
    const code = (parts[0] === "http" ? "http" : parts[parts.length - 1]) as keyof typeof text.status;
    return text.status[code] ?? text.status.unknown;
  };
  const update = (patch: Partial<Draft>) => setEditing((current) => current ? { ...current, ...patch } : current);

  const field = (key: keyof Draft, label: string, placeholder = "", type = "text") => (
    <SettingsRow key={key} title={label}>
      <SettingsInput type={type} value={String(editing?.[key] ?? "")} placeholder={placeholder} disabled={busy}
        autoComplete="off" onChange={(event) => update({ [key]: event.currentTarget.value })} />
    </SettingsRow>
  );

  const save = async () => {
    if (!editing || busy) return;
    setBusy(true);
    setMessage(text.status.checking);
    try {
      const input: RelayAccountInput = {
        ...editing,
        name: editing.name.trim(),
        baseUrl: editing.baseUrl.trim().replace(/\/+$/, ""),
        accessToken: editing.accessToken?.trim() || undefined,
        refreshToken: editing.refreshToken?.trim() || undefined,
        apiKey: editing.apiKey?.trim() || undefined,
        userId: editing.userId?.trim() || undefined,
        divisor: editing.divisor === undefined || String(editing.divisor).trim() === "" ? undefined : Number(editing.divisor),
      };
      await checkRelayAccount(input);
      setAccounts(await saveRelayAccount(input));
      setEditing(null);
      setMessage(text.status.saved);
      if (polling) void notifyRelayUsageChanged().catch(() => undefined);
    } catch (error) {
      setMessage(failure(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      setAccounts(await deleteRelayAccount(id));
      setConfirmId(null);
      setMessage(null);
      if (polling) void notifyRelayUsageChanged().catch(() => undefined);
    } catch (error) {
      setMessage(failure(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsRow indent title={text.title} description={<span role="status">{summary}{message && ` · ${message}`}</span>}
      control={<SettingsLinkButton onClick={() => { setOpen(true); setMessage(null); }}>{text.settings}</SettingsLinkButton>}>
      {open && (
        <SettingsDialog title={text.title} onClose={() => { setOpen(false); setEditing(null); setConfirmId(null); }} actions={<>
          <SettingsLinkButton onClick={() => { setOpen(false); setEditing(null); }}>{text.cancel}</SettingsLinkButton>
        </>}>
          {editing ? (
            <>
              <div className="relay-accounts__form">
                {field("name", text.name)}
                <SettingsRow title={text.adapter} control={<SettingsSelect value={editing.adapter} ariaLabel={text.adapter} disabled={busy}
                  options={ADAPTERS.map((adapter) => ({ value: adapter, label: text.adapterOptions[adapter] }))}
                  onChange={(adapter) => update({ adapter })} />} />
                {field("baseUrl", text.baseUrl, "https://relay.example.com")}
                {(editing.adapter === "newapi-account" || editing.adapter === "sub2api") && field("accessToken", text.accessToken, text.secretHint, "password")}
                {editing.adapter === "sub2api" && field("refreshToken", text.refreshToken, text.secretHint, "password")}
                {(editing.adapter === "newapi-token" || editing.adapter === "custom") && field("apiKey", text.apiKey, text.secretHint, "password")}
                {editing.adapter === "newapi-account" && field("userId", text.userId)}
                {editing.adapter === "custom" && <>
                  {field("endpointPath", text.endpointPath, "/user/balance")}
                  <SettingsRow title={text.authMode} control={<SettingsSelect value={editing.authMode ?? "bearer"} ariaLabel={text.authMode} disabled={busy}
                    options={[{ value: "bearer", label: text.authModes.bearer }, { value: "x-api-key", label: text.authModes.xApiKey }]}
                    onChange={(authMode) => update({ authMode })} />} />
                  {field("remainingPath", text.remainingPath, "data.balance")}
                  {field("usedPath", text.usedPath)}
                  {field("totalPath", text.totalPath)}
                  {field("currency", text.currency, "USD")}
                  {field("divisor", text.divisor, "500000")}
                </>}
              </div>
              {message && <p className="relay-accounts__error" role="alert">{message}</p>}
              <div className="relay-accounts__footer">
                <SettingsLinkButton disabled={busy} onClick={() => { setEditing(null); setMessage(null); }}>{text.cancel}</SettingsLinkButton>
                <button className="settings-dialog__primary" type="button" disabled={busy || !editing.name.trim() || !editing.baseUrl.trim()} onClick={() => void save()}>{text.save}</button>
              </div>
            </>
          ) : (
            <>
              <div className="relay-accounts__list">
                {(accounts ?? []).map((account) => (
                  <div className="relay-accounts__item" key={account.id}>
                    <div>
                      <div className="relay-accounts__name">{account.name}</div>
                      <div className="relay-accounts__detail">{text.adapterOptions[account.adapter]} · {account.baseUrl}</div>
                    </div>
                    <div className="relay-accounts__actions">
                      <SettingsLinkButton disabled={busy} onClick={() => { setEditing(draft(account)); setMessage(null); }}>{text.edit}</SettingsLinkButton>
                      <SettingsLinkButton tone="danger" disabled={busy}
                        onClick={() => confirmId === account.id ? void remove(account.id) : setConfirmId(account.id)}>
                        {confirmId === account.id ? text.confirmDelete : text.delete}
                      </SettingsLinkButton>
                    </div>
                  </div>
                ))}
                {!accounts?.length && <p>{text.empty}</p>}
              </div>
              {message && <p className="relay-accounts__error" role="alert">{message}</p>}
              <div className="relay-accounts__footer">
                <SettingsLinkButton disabled={busy} onClick={() => { setEditing(draft()); setMessage(null); }}>{text.add}</SettingsLinkButton>
              </div>
            </>
          )}
        </SettingsDialog>
      )}
    </SettingsRow>
  );
}
