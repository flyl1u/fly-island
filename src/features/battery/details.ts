import type { BatteryText } from "../../i18n/sections/battery";
import { batteryHealth, summarizeBattery } from "./display.ts";
import type { BatteryPowerEstimate } from "./powerEstimate";
import { describeBatteryRuntime } from "./readout.ts";
import type { BatterySnapshot } from "./snapshot";

/**
 * The Battery page's text. One line says where the battery is heading and how fast; the stats under
 * it are what the percentage cannot tell: how much the battery still holds against its design.
 */
export function formatBatteryDetails(snapshot: BatterySnapshot, estimate: BatteryPowerEstimate | null, locale: string, text: BatteryText) {
  const summary = summarizeBattery(snapshot, estimate);
  const { state, percent, low, flow } = summary;
  const percentFormat = new Intl.NumberFormat(locale, { style: "percent" });
  const oneDecimal = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const { remainingMwh = null, fullMwh = null, designMwh = null, rateMw = null } = snapshot.details ?? {};

  // The measured rate when there is one, as the time estimate uses it; the direction is the status line's to say.
  const milliwatts = flow === null ? null : estimate?.rateMw ?? rateMw;
  const power = milliwatts === null || milliwatts === 0 ? null : oneDecimal.format(Math.abs(milliwatts) / 1000) + " W";
  const health = batteryHealth(fullMwh, designMwh);
  const capacity = (mwh: number | null) => mwh === null ? null : oneDecimal.format(mwh / 1000) + " Wh";
  const stats = [
    { key: "current", label: text.current, value: capacity(remainingMwh) },
    { key: "full", label: text.full, value: capacity(fullMwh) },
    { key: "design", label: text.design, value: capacity(designMwh) },
    { key: "health", label: text.health, value: health === null ? null : percentFormat.format(health / 100) },
  ].flatMap(({ key, label, value }) => value === null ? [] : [{ key, label, value }]);

  return {
    percent,
    charge: percent === null ? null : percentFormat.format(percent / 100),
    state,
    low,
    status: text.state[state],
    runtime: describeBatteryRuntime(summary, text),
    power,
    stats,
  };
}
