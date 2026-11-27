import { useEffect, useState } from "react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { useTranslation } from "../../i18n";
import { loadSettings } from "../appearance/storage";
import { clearAppLog, exportDiagnosticBundle, getAppLogState, listenAppLogChanged, openAppLogFolder, setAppLogEnabled, type AppLogState } from "./api";
import { diagnosticIslandSettings } from "./islandSettings";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AppLogSettingsSection() {
  const text = useTranslation().settings.diagnostics;
  const [state, setState] = useState<AppLogState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<{ path: string } | "error" | null>(null);

  useEffect(() => {
    const refresh = () => void getAppLogState().then(setState).catch(() => {});
    refresh();
    const unlisten = listenAppLogChanged(refresh);
    return () => void unlisten.then((stop) => stop());
  }, []);

  const run = (action: () => Promise<AppLogState | void>) => {
    setError(null);
    void action().then((next) => { if (next) setState(next); }).catch((reason) => setError(String(reason)));
  };

  const exportBundle = async () => {
    setExporting(true);
    setExportStatus(null);
    try {
      const path = await exportDiagnosticBundle(text.exportTitle, diagnosticIslandSettings(loadSettings()));
      if (path) setExportStatus({ path });
    } catch {
      setExportStatus("error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <SettingsGroup title={text.title}>
      <SettingsToggleRow
        title={text.enable}
        description={text.enableHint}
        checked={state?.enabled ?? false}
        disabled={state === null}
        onChange={(enabled) => run(() => setAppLogEnabled(enabled))}
      />
      <SettingsRow
        title={text.file}
        description={<span role="status">{error ?? (state ? text.fileHint(formatSize(state.bytes)) : "")}</span>}
        control={<>
          <SettingsLinkButton onClick={() => run(openAppLogFolder)}>{text.open}</SettingsLinkButton>
          <SettingsLinkButton disabled={!state?.bytes} onClick={() => run(clearAppLog)}>{text.clear}</SettingsLinkButton>
        </>}
      />
      <SettingsRow
        title={text.exportTitle}
        description={<span role="status" style={{ overflowWrap: "anywhere" }}>
          {exporting ? text.exporting : exportStatus === "error" ? text.exportFailed : exportStatus ? text.exportSaved(exportStatus.path) : text.exportHint}
        </span>}
        control={<SettingsLinkButton disabled={exporting} onClick={() => void exportBundle()}>{text.exportButton}</SettingsLinkButton>}
      />
    </SettingsGroup>
  );
}
