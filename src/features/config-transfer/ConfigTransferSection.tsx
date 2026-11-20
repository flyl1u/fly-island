import { useEffect, useState } from "react";
import { Download, Upload } from "lucide-react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { useTranslation } from "../../i18n";
import { collectConfigStorage } from "./storage";
import { validateBackup, type ConfigBackup } from "./format";
import { dismissImportReport, exportConfig, getImportReport, readConfigImport, restartAfterImport, stageConfigImport, type ImportReport } from "./api";
import { transferError } from "./errors";
import "./ConfigTransferSection.css";

type Step = "idle" | "export" | "confirm" | "confirmAgain";

export function ConfigTransferSection() {
  const t = useTranslation().settings.configTransfer;
  const [step, setStep] = useState<Step>("idle");
  const [includeHistory, setIncludeHistory] = useState(false);
  const [backup, setBackup] = useState<ConfigBackup | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);

  useEffect(() => {
    let active = true;
    void getImportReport().then((value) => { if (active) setReport(value); }).catch(console.error);
    return () => { active = false; };
  }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try { await action(); } catch (error) { setMessage(transferError(error, t)); }
    finally { setBusy(false); }
  };

  const chooseImport = () => void run(async () => {
    const result = await readConfigImport(t.import);
    if (result) { setBackup(validateBackup(result)); setStep("confirm"); }
  });
  const saveExport = () => void run(async () => {
    if (await exportConfig(collectConfigStorage(includeHistory), includeHistory, t.export)) {
      setStep("idle"); setMessage(t.exported);
    }
  });
  const restore = () => void run(async () => {
    if (!backup) return;
    await stageConfigImport(backup);
    await restartAfterImport();
  });
  const cancel = () => { setStep("idle"); setBackup(null); setMessage(""); };
  const clipboard = backup?.files.clipboard;
  const includesHistory = typeof clipboard === "object" && clipboard !== null && "history" in clipboard && clipboard.history !== null;

  return (
    <SettingsGroup title={t.title} footer={t.hint}>
      <div className="config-transfer">
        <div className="config-transfer__actions">
          <SettingsLinkButton disabled={busy || step !== "idle"} onClick={() => { setIncludeHistory(false); setMessage(""); setStep("export"); }}>
            <Download size={14} aria-hidden="true" />{t.export}
          </SettingsLinkButton>
          <SettingsLinkButton disabled={busy || step !== "idle"} onClick={chooseImport}>
            <Upload size={14} aria-hidden="true" />{t.import}
          </SettingsLinkButton>
        </div>
        {step === "export" && <div className="config-transfer__prompt" role="group" aria-label={t.export}>
          <p>{t.exportHint}</p>
          <label className="config-transfer__checkbox"><input type="checkbox" checked={includeHistory} disabled={busy} onChange={(event) => setIncludeHistory(event.target.checked)} />{t.includeHistory}</label>
          <div className="config-transfer__actions"><SettingsLinkButton disabled={busy} onClick={saveExport}>{t.continue}</SettingsLinkButton><SettingsLinkButton disabled={busy} onClick={cancel}>{t.cancel}</SettingsLinkButton></div>
        </div>}
        {(step === "confirm" || step === "confirmAgain") && <div className="config-transfer__prompt" role="alert">
          <p>{step === "confirm" ? t.confirm : t.confirmAgain}</p>
          {step === "confirm" && <><p>{backup?.appVersion} · {backup?.exportedAt}</p><p>{includesHistory ? t.clipboardIncluded : t.clipboardExcluded}</p></>}
          <p>{t.credentials}</p>
          <div className="config-transfer__actions"><SettingsLinkButton tone="danger" disabled={busy} onClick={step === "confirm" ? () => setStep("confirmAgain") : restore}>{step === "confirm" ? t.confirmAction : t.restartAction}</SettingsLinkButton><SettingsLinkButton disabled={busy} onClick={cancel}>{t.cancel}</SettingsLinkButton></div>
        </div>}
        <div role="status" aria-live="polite">{busy ? t.busy : message}</div>
        {report && <div className="config-transfer__prompt" role="status">
          <p>{report.warnings.length ? t.warnings : t.success}</p><p>{t.credentials}</p>
          {report.missingPlugins.length > 0 && <><p>{t.missingPlugins}</p><ul>{report.missingPlugins.map((plugin) => <li key={plugin}>{plugin}</li>)}</ul></>}
          {report.warnings.length > 0 && <ul>{report.warnings.map((warning, index) => <li key={index}>{transferError(warning, t)}</li>)}</ul>}
          <SettingsLinkButton onClick={() => void run(async () => { await dismissImportReport(); setReport(null); })}>{t.dismiss}</SettingsLinkButton>
        </div>}
      </div>
    </SettingsGroup>
  );
}
