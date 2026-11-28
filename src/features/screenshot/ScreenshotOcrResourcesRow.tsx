import { useEffect, useState } from "react";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { useTranslation } from "../../i18n";
import { installScreenshotOcr, screenshotOcrInstalled } from "./api";

export function ScreenshotOcrResourcesRow() {
  const text = useTranslation().screenshot.plugin;
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let disposed = false;
    void screenshotOcrInstalled().then((value) => { if (!disposed) setInstalled(value); })
      .catch(() => { if (!disposed) setError(true); });
    return () => { disposed = true; };
  }, []);
  return <SettingsRow title={text.ocrModel} description={<>
    {installed ? text.ocrInstalled : text.ocrDownloadHint}
    {error && <span role="alert">{text.ocrFailed}</span>}
  </>} control={<SettingsLinkButton disabled={busy || installed} onClick={() => {
    setBusy(true); setError(false);
    void installScreenshotOcr().then(() => setInstalled(true)).catch(() => setError(true)).finally(() => setBusy(false));
  }}>{installed ? text.ocrInstalledAction : busy ? text.ocrDownloading : text.ocrDownload}</SettingsLinkButton>} />;
}
