import { Zap } from "lucide-react";
import { useLocale, useTranslation } from "../../i18n";
import type { BatterySnapshot } from "./snapshot";
import { BatteryHistoryChart } from "./BatteryHistoryChart";
import type { BatteryHistory } from "./history";
import type { BatteryPowerEstimate } from "./powerEstimate";
import { formatBatteryDetails } from "./details";
import "./BatteryPanel.css";

export function BatteryPanel({ snapshot, estimate, history }: {
  snapshot: BatterySnapshot;
  estimate: BatteryPowerEstimate | null;
  history: BatteryHistory | null;
}) {
  const t = useTranslation().battery;
  const { locale } = useLocale();
  const { percent, charge, state, low, status, runtime, power, stats } = formatBatteryDetails(snapshot, estimate, locale, t);
  const nothingKnown = runtime === null && power === null && stats.length === 0 && state !== "unknown";

  return (
    <section className="battery-panel" aria-label={t.name} data-state={state} data-low={low || undefined}>
      <div className="battery-panel__summary">
        {charge !== null && <strong className="battery-panel__percent">{charge}</strong>}
        <div className="battery-panel__status">
          <span className="battery-panel__state">
            {state === "charging" && <Zap size={14} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />}
            {status}
          </span>
          {(runtime !== null || power !== null) && (
            <span className="battery-panel__facts">
              {runtime !== null && <span data-fact="runtime">{runtime}</span>}
              {power !== null && <span data-fact="power">{power}</span>}
            </span>
          )}
          {nothingKnown && <span className="battery-panel__facts">{t.detailsUnavailable}</span>}
        </div>
      </div>
      {percent !== null && (
        <div className="battery-panel__track" aria-hidden="true">
          <span className="battery-panel__fill" style={{ inlineSize: `${percent}%` }} />
        </div>
      )}
      {stats.length > 0 && (
        <dl className="battery-panel__stats">
          {stats.map(({ key, label, value }) => (
            <div key={key} data-stat={key}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {history && <BatteryHistoryChart history={history} />}
    </section>
  );
}
