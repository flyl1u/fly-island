import { BatteryLow } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { BatteryAlert } from "./lowBattery";
import "./BatteryAlertPopup.css";

/** The collapsed island's line for a low battery: "Cloud III S Wireless at 15%". */
export function BatteryAlertPopup({ alert }: { alert: BatteryAlert }) {
  const t = useTranslation().deviceBattery;

  return (
    <span className="device-battery-alert" role="status">
      <BatteryLow className="device-battery-alert__icon" size={16} strokeWidth={2.2} aria-hidden="true" />
      <span className="device-battery-alert__text">{t.lowAlert(alert.name, alert.percent)}</span>
    </span>
  );
}
