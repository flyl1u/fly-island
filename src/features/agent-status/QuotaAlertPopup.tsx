import { Gauge, RotateCcw } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { QuotaAlert } from "./quotaAlerts";
import "./QuotaAlertPopup.css";

/** The collapsed island's line for a usage alert: "Claude 5-hour usage at 82%", or that it reset. */
export function QuotaAlertPopup({ alert }: { alert: QuotaAlert }) {
  const text = useTranslation().agent.quota;
  const agent = alert.agent === "claude" ? "Claude" : alert.agent === "dsh" ? "DSH" : "Codex";
  const span = alert.window === "fiveHour" ? text.fiveHour : text.sevenDay;
  const low = alert.kind === "low";
  const message = alert.window === "balance" ? (low ? text.dshEmpty : text.dshRestored) : low ? text.low(agent, span, Math.round(alert.used)) : text.reset(agent, span);
  const Icon = low ? Gauge : RotateCcw;

  return (
    <span className={`agent-quota-alert agent-quota-alert--${alert.kind}`} role="status">
      <Icon className="agent-quota-alert__icon" size={16} strokeWidth={2.2} aria-hidden="true" />
      <span className="agent-quota-alert__text">{message}</span>
    </span>
  );
}
