import { useState } from "react";
import { Check, Copy, RefreshCcw } from "lucide-react";
import { ToggleControl } from "../../components/controls/ToggleControl";
import { useTranslation } from "../../i18n";
import { useLocalApiSettings } from "./useLocalApiSettings";
import "./LocalApiSettingsSection.css";

type CopyTarget = "url" | "token";

/** Settings for the local API: on/off, write access, address and access token. */
export function LocalApiSettingsSection() {
  const t = useTranslation();
  const { state, error, busy, setEnabled, setAllowWrite, resetToken } = useLocalApiSettings();
  const [copied, setCopied] = useState<CopyTarget | null>(null);

  const copy = (target: CopyTarget, text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(target);
      window.setTimeout(() => setCopied((current) => (current === target ? null : current)), 1500);
    });
  };

  const copyButton = (target: CopyTarget, text: string) => (
    <button className="local-api-button" type="button" onClick={() => copy(target, text)}>
      {copied === target ? <Check size={13} strokeWidth={2.6} /> : <Copy size={13} strokeWidth={2.4} />}
      <span>{copied === target ? t.settings.localApi.copied : t.settings.localApi.copy}</span>
    </button>
  );

  return (
    <section className="settings-section local-api-panel">
      <div className="settings-section__header">
        <span>{t.settings.localApi.title}</span>
        {state?.enabled ? (
          <span className={`local-api-status${state.running ? " local-api-status--running" : ""}`}>
            {state.running ? t.settings.localApi.running : t.settings.localApi.stopped}
          </span>
        ) : null}
      </div>
      <p className="settings-section__hint">{t.settings.localApi.hint}</p>
      <ToggleControl
        label={t.settings.localApi.enable}
        checked={state?.enabled ?? false}
        onChange={(enabled) => !busy && setEnabled(enabled)}
      />
      {state?.enabled ? (
        <>
          <ToggleControl
            label={t.settings.localApi.allowWrite}
            checked={state.allowWrite}
            onChange={(allowWrite) => !busy && setAllowWrite(allowWrite)}
          />
          <p className="settings-section__hint">{t.settings.localApi.allowWriteHint}</p>
          <div className="local-api-row">
            <span>{t.settings.localApi.address}</span>
            <code title={state.url}>{state.url}</code>
            {copyButton("url", state.url)}
          </div>
          <div className="local-api-row">
            <span>{t.settings.localApi.token}</span>
            <code>{"•".repeat(12)}</code>
            {copyButton("token", state.token)}
            <button className="local-api-button" type="button" disabled={busy} onClick={resetToken}>
              <RefreshCcw size={13} strokeWidth={2.4} />
              <span>{t.settings.localApi.resetToken}</span>
            </button>
          </div>
          <div className="local-api-row">
            <span>{t.settings.localApi.configFile}</span>
            <code title={state.configPath}>{state.configPath}</code>
          </div>
        </>
      ) : null}
      {error ? <div className="local-api-error">{error}</div> : null}
    </section>
  );
}
