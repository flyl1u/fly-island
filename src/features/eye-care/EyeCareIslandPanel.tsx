import { useState } from "react";
import { useCountdown } from "../../lib/useCountdown";
import { useElapsed } from "../../lib/useElapsed";
import { formatCountdown } from "../../utils/countdown";
import { useLocale, useTranslation } from "../../i18n";
import { runPluginAction } from "../plugins/api";
import type { PluginPanelRow } from "../plugins/api";
import { refreshPlugins, usePlugins } from "../plugins/usePlugins";
import { islandPanelActions } from "../plugins/panelActions";
import "./EyeCareIslandPanel.css";

/** The bar's share, stepped by the very seconds the digits show. A fixed duration or a row
 * without a span keeps the share the plugin measured. */
function rowPercent(row: PluginPanelRow, seconds: number | null): number | null {
  const total = row.totalMs ?? 0;
  if (seconds === null || total <= 0) return row.percent;
  const share = ((seconds * 1000) / total) * 100;
  return Math.round(Math.min(100, Math.max(0, share)) * 100) / 100;
}

/**
 * One row of the card: a deadline counts down, a break counts up, and a held timer or a finished
 * total stands still. Both the digits and the bar read one tick, so the bar steps on the same
 * second as its number and ends exactly empty or full instead of trailing the plugin's publish.
 */
function EyeCareRow({ row }: { row: PluginPanelRow }) {
  const from = row.countUpFrom ?? null;
  const deadline = row.countdownTo;
  // Both hooks always run; the field the row does not use stays null and never ticks.
  const remaining = useCountdown(deadline);
  const elapsed = useElapsed(from);
  const seconds = from !== null ? elapsed : deadline !== null ? remaining : null;
  const percent = rowPercent(row, seconds);
  const stacked = deadline !== null || from !== null || row.durationMs != null;
  return (
    <li className={`eye-care-island__row eye-care-island__row--${row.tone ?? "normal"}`}>
      <div className={`eye-care-island__line${stacked ? " eye-care-island__line--stack" : ""}`}>
        <span className="eye-care-island__label">{row.title}</span>
        {from !== null ? (
          <span className="eye-care-island__value eye-care-island__value--countdown">{formatCountdown(elapsed, true)}</span>
        ) : row.durationMs != null ? (
          <span className="eye-care-island__value eye-care-island__value--countdown">{formatCountdown(Math.floor(row.durationMs / 1000), true)}</span>
        ) : deadline !== null ? (
          <span className="eye-care-island__value eye-care-island__value--countdown">{formatCountdown(remaining, true)}</span>
        ) : row.percent !== null ? (
          <span className="eye-care-island__value">{Math.round(row.percent)}%</span>
        ) : null}
      </div>
      {row.detail && <div className="eye-care-island__detail">{row.detail}</div>}
      {percent !== null && (
        <div className="eye-care-island__meter" aria-hidden="true">
          <span style={{ width: `${percent}%` }} />
        </div>
      )}
    </li>
  );
}

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
  // The panel's words follow the plugin's own language; the host's fallback copy follows the app.
  const contentLanguage = panel ? (installed.settings.language === "en" ? "en" : "zh-CN") : locale;
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
    <section className="eye-care-island" lang={contentLanguage} aria-label={installed.manifest.name[contentLanguage]}>
      {panel && panel.rows.length > 0 ? (
        <div className="eye-care-island__card">
          {head}
          <ul className="eye-care-island__rows">
            {panel.rows.map((row) => <EyeCareRow key={row.id} row={row} />)}
          </ul>
          {actions.length > 0 && (
            <div className="eye-care-island__actions" lang={locale}>
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
          <p className="eye-care-island__empty" lang={locale}>{panel ? text.empty : statusText}</p>
        </>
      )}
      {error && <p className="eye-care-island__error" role="alert" lang={locale}>{error}</p>}
    </section>
  );
}
