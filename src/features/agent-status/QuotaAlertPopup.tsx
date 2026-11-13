import { Gauge, RotateCcw } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { QuotaAlert } from "./quotaAlerts";
import "./QuotaAlertPopup.css";

/** The collapsed island's line for a usage alert: "Claude 5-hour usage at 82%", or that it reset. */
export function QuotaAlertPopup({ alert }: { alert: QuotaAlert }) {
  const text = useTranslation().agent.quota;
  const agent = { claude: "Claude", codex: "Codex", dsh: "DSH", workbuddy: "WorkBuddy" }[alert.agent];
  const span = alert.window === "fiveHour" ? text.fiveHour : text.sevenDay;
  const low = alert.kind === "low";
  const balance = alert.agent === "workbuddy" ? [text.workbuddyEmpty, text.workbuddyRestored] : [text.dshEmpty, text.dshRestored];
  const message = alert.window === "balance" ? balance[low ? 0 : 1] : low ? text.low(agent, span, Math.round(alert.used)) : text.reset(agent, span);
  const Icon = low ? Gauge : RotateCcw;

  return (
    <span className={`agent-quota-alert agent-quota-alert--${alert.kind}`} role="status">
      <Icon className="agent-quota-alert__icon" size={16} strokeWidth={2.2} aria-hidden="true" />
      <span className="agent-quota-alert__text">{message}</span>
    </span>
  );
}
