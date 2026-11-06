import { useRef, useState, type ChangeEvent } from "react";
import { Download, FolderOpen, RotateCw, Upload } from "lucide-react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { useTranslation } from "../../i18n";
import { restartIsland, revealBackup, saveSettingsBackup } from "./api";
import { backupFileName, parseBackup } from "./backup.ts";
import { collectBackup, restoreBackup } from "./storage.ts";
import "./SettingsBackupSection.css";

type Status =
  | { kind: "idle" }
  | { kind: "saved"; path: string }
  | { kind: "restored"; count: number }
  | { kind: "error"; message: string };

/** Settings → General: save the settings to a file, or restore them from one. */
export function SettingsBackupSection() {
  const t = useTranslation();
  const text = t.settings.backup;
  const fileInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const save = () => {
    const now = new Date();
    void saveSettingsBackup(backupFileName(now), JSON.stringify(collectBackup(now), null, 2))
      .then((path) => setStatus({ kind: "saved", path }))
      .catch((error: unknown) => setStatus({ kind: "error", message: String(error) }));
  };

  const restore = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    const parsed = parseBackup(await file.text());
    if ("problem" in parsed) {
      setStatus({ kind: "error", message: text.problems[parsed.problem] });
      return;
    }
    if (!window.confirm(text.confirmRestore)) return;
    setStatus({ kind: "restored", count: restoreBackup(parsed.keys) });
  };

  const footer = (
    <>
      <p>{text.hint}</p>
      {status.kind === "saved" && (
        <p className="settings-backup__status" role="status">
          <span>{text.saved(status.path)}</span>
          <button className="settings-backup__link" type="button" onClick={() => void revealBackup(status.path)}>
            <FolderOpen size={12} strokeWidth={2.2} aria-hidden="true" />
            {text.reveal}
          </button>
        </p>
      )}
      {status.kind === "restored" && (
        <p className="settings-backup__status" role="status">
          <span>{text.restored(status.count)}</span>
          <button className="settings-backup__link" type="button" onClick={() => void restartIsland()}>
            <RotateCw size={12} strokeWidth={2.2} aria-hidden="true" />
            {text.restart}
          </button>
        </p>
      )}
      {status.kind === "error" && (
        <p className="settings-backup__status settings-backup__status--error" role="alert">{status.message}</p>
      )}
    </>
  );

  return (
    <SettingsGroup title={text.title} footer={footer}>
      <SettingsRow
        title={text.save}
        control={
          <SettingsLinkButton onClick={save}>
            <Download size={13} strokeWidth={2.2} aria-hidden="true" />
            {text.saveAction}
          </SettingsLinkButton>
        }
      />
      <SettingsRow
        title={text.restore}
        control={
          <>
            <SettingsLinkButton onClick={() => fileInput.current?.click()}>
              <Upload size={13} strokeWidth={2.2} aria-hidden="true" />
              {text.restoreAction}
            </SettingsLinkButton>
            <input
              ref={fileInput}
              className="settings-backup__file"
              type="file"
              accept=".json,application/json"
              aria-label={text.restore}
              onChange={(event) => void restore(event)}
            />
          </>
        }
      />
    </SettingsGroup>
  );
}
