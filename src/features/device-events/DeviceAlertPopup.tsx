import { BatteryCharging, BatteryLow, Headphones, Speaker, Unplug, type LucideIcon } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { DeviceAlert } from "./api";
import "./DeviceAlertPopup.css";

/** The collapsed island's device line: an icon, what happened, and the battery level if known. */
export function DeviceAlertPopup({ alert }: { alert: DeviceAlert }) {
  const text = useTranslation().island.deviceAlert;
  let Icon: LucideIcon;
  let message: string;
  let tone: "on" | "off" | "warn" | "charge";
  switch (alert.kind) {
    case "audioConnected":
    case "audioDisconnected":
      Icon = alert.device === "speaker" ? Speaker : Headphones;
      message = alert.kind === "audioConnected" ? text.connected(alert.name) : text.disconnected(alert.name);
      tone = alert.kind === "audioConnected" ? "on" : "off";
      break;
    case "batteryLow":
      Icon = BatteryLow;
      message = text.batteryLow(alert.name);
      tone = "warn";
      break;
    case "powerConnected":
      Icon = BatteryCharging;
      message = text.charging;
      tone = "charge";
      break;
    case "powerDisconnected":
      Icon = Unplug;
      message = text.unplugged;
      tone = "off";
      break;
  }
  const battery = "battery" in alert ? alert.battery : null;
  const label = battery === null ? message : `${message}, ${text.battery(battery)}`;

  return (
    <span className={`device-alert device-alert--${tone}`} role="status" aria-label={label}>
      <Icon className="device-alert__icon" size={16} strokeWidth={2.2} aria-hidden="true" />
      <span className="device-alert__text" aria-hidden="true">{message}</span>
      {battery !== null && <span className="device-alert__battery" aria-hidden="true">{battery}%</span>}
    </span>
  );
}
