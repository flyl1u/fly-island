import { useState } from "react";
import { Countdown } from "../../components/countdown/Countdown";
import { formatCountdown } from "../../utils/countdown";
import { useLocale, useTranslation } from "../../i18n";
import { runPluginAction } from "../plugins/api";
import { refreshPlugins, usePlugins } from "../plugins/usePlugins";
import { islandPanelActions } from "../plugins/panelActions";
import "./EyeCareIslandPanel.css";

/**
 * Eye Care's own page in the expanded island. The plugin publishes the headline, a row and the
 * actions; this page draws them as one card with the remaining time standing over its label and
 * a bar under both. It is Eye Care's page rather than the host's generic plugin page, so the
 * layout other plugins share stays as it is.
 */
export function EyeCareIslandPanel() {
  const t = useTranslation();
  const text = t.pluginPanel;
  const { locale } = useLocale();
  const { registry, live } = usePlugins();
  const installed = registry.installed["eye-care"];
  const status = live["eye-care"]?.status;
  const panel = live["eye-care"]?.panel ?? null;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  if (!installed) return null;
  const actions = islandPanelActions(panel)
    .map((id) => installed.manifest.actions.find((action) => action.id === id))
    .filter((action) => action !== undefined);
  const statusText = status === "failed" ? t.settings.plugins.status.failed : status === "starting" || status === "restarting" ? t.settings.plugins.status[status] : text.waiting;

  const run = async (action: string) => {
    setBusy(action);
    setError("");
    try {
      await runPluginAction("eye-care", action);
      await refreshPlugins();
    } catch (failure) {
      setError(`${text.failed}: ${String(failure)}`);
    } finally {
      setBusy(null);
    }
  };

  const head = (
    <div className="eye-care-island__head">
      <h2 className="eye-care-island__headline">{panel?.headline ?? installed.manifest.name[locale]}</h2>
      {panel?.note && <p className="eye-care-island__note">{panel.note}</p>}
    </div>
  );

  return (
    <section className="eye-care-island" aria-label={installed.manifest.name[locale]}>
      {panel && panel.rows.length > 0 ? (
        <div className="eye-care-island__card">
          {head}
          <ul className="eye-care-island__rows">
            {panel.rows.map((row) => {
              // A deadline counts down; a finished total (the break is due) stands still.
              const stacked = row.countdownTo !== null || row.totalMs != null;
              return (
                <li key={row.id} className={`eye-care-island__row eye-care-island__row--${row.tone ?? "normal"}`}>
                  <div className={`eye-care-island__line${stacked ? " eye-care-island__line--stack" : ""}`}>
                    <span className="eye-care-island__label">{row.title}</span>
                    {row.totalMs != null ? (
                      <span className="eye-care-island__value eye-care-island__value--countdown">{formatCountdown(Math.floor(row.totalMs / 1000), true)}</span>
                    ) : row.countdownTo !== null ? (
                      <span className="eye-care-island__value eye-care-island__value--countdown"><Countdown deadline={row.countdownTo} padMinutes /></span>
                    ) : row.percent !== null ? (
                      <span className="eye-care-island__value">{Math.round(row.percent)}%</span>
                    ) : null}
                  </div>
                  {row.detail && <div className="eye-care-island__detail">{row.detail}</div>}
                  {row.percent !== null && (
                    <div className="eye-care-island__meter" aria-hidden="true">
                      <span style={{ width: `${Math.min(100, Math.max(0, row.percent))}%` }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {actions.length > 0 && (
            <div className="eye-care-island__actions">
              {actions.map((action, index) => (
                <button
                  key={action.id}
                  // The main action comes last: the quieter ones (reset the screen time, postpone
                  // the break) sit to its left.
                  className={index === actions.length - 1 ? "eye-care-island__action eye-care-island__action--primary" : "eye-care-island__action"}
                  type="button"
                  disabled={busy !== null || status !== "running"}
                  onClick={(event) => {
                    event.stopPropagation();
                    void run(action.id);
                  }}
                >
                  {action.label[locale]}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {head}
          <p className="eye-care-island__empty">{panel ? text.empty : statusText}</p>
        </>
      )}
      {error && <p className="eye-care-island__error" role="alert">{error}</p>}
    </section>
  );
}
