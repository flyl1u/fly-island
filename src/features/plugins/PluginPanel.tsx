import { useState } from "react";
import { Countdown } from "../../components/countdown/Countdown";
import { useLocale, useTranslation } from "../../i18n";
import { runPluginAction } from "./api";
import { refreshPlugins, usePlugins } from "./usePlugins";
import "./PluginPanel.css";

/**
 * A plugin's page in the expanded island. The plugin sends a panel (headline, rows, action
 * ids); the island draws it with its own components — no HTML or styles come from the plugin.
 */
export function PluginPanel({ pluginId }: { pluginId: string }) {
  const t = useTranslation();
  const text = t.pluginPanel;
  const { locale } = useLocale();
  const { registry, live } = usePlugins();
  const installed = registry.installed[pluginId];
  const status = live[pluginId]?.status;
  const panel = live[pluginId]?.panel ?? null;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  if (!installed) return null;
  const actions = (panel?.actions ?? [])
    .map((id) => installed.manifest.actions.find((action) => action.id === id))
    .filter((action) => action !== undefined);
  const statusText = status === "failed" ? t.settings.plugins.status.failed : status === "starting" || status === "restarting" ? t.settings.plugins.status[status] : text.waiting;

  const run = async (action: string) => {
    setBusy(action);
    setError("");
    try {
      await runPluginAction(pluginId, action);
      await refreshPlugins();
    } catch (failure) {
      setError(`${text.failed}: ${String(failure)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="plugin-panel" aria-label={installed.manifest.name[locale]}>
      <header className="plugin-panel__head">
        <div className="plugin-panel__heading">
          <h2 className="plugin-panel__headline">{panel?.headline ?? installed.manifest.name[locale]}</h2>
          <p className="plugin-panel__note">{panel?.note ?? installed.manifest.description[locale]}</p>
        </div>
      </header>
      {panel && panel.rows.length > 0 ? (
        <ul className="plugin-panel__rows">
          {panel.rows.map((row) => (
            <li key={row.id} className={`plugin-panel__row plugin-panel__row--${row.tone ?? "normal"}`}>
              <div className="plugin-panel__line">
                <span className="plugin-panel__title">{row.title}</span>
                {row.countdownTo !== null ? (
                  <span className="plugin-panel__value plugin-panel__value--countdown"><Countdown deadline={row.countdownTo} padMinutes={pluginId === "eye-care"} /></span>
                ) : row.percent !== null ? (
                  <span className="plugin-panel__value">{Math.round(row.percent)}%</span>
                ) : null}
              </div>
              {row.detail && <div className="plugin-panel__detail">{row.detail}</div>}
              {row.percent !== null && (
                <div className="plugin-panel__meter" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, Math.max(0, row.percent))}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="plugin-panel__empty">{panel ? text.empty : statusText}</p>
      )}
      {actions.length > 0 && (
        <div className="plugin-panel__actions">
          {actions.map((action, index) => (
            <button
              key={action.id}
              className={index === 0 ? "plugin-panel__action plugin-panel__action--primary" : "plugin-panel__action"}
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
      {error && <p className="plugin-panel__error" role="alert">{error}</p>}
    </section>
  );
}
