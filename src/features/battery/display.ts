import type { BatteryPowerEstimate } from "./powerEstimate";
import type { BatterySnapshot } from "./snapshot";

export type BatteryState = "charging" | "full" | "plugged" | "idle" | "pluggedDischarging" | "onBattery" | "unknown";

export type BatteryFlow = "charging" | "discharging";

export function getBatteryFlow(snapshot: BatterySnapshot, sampledRate?: number): BatteryFlow | null {
  const rate = sampledRate ?? snapshot.details?.rateMw ?? 0;
  if (snapshot.pluggedIn === false || rate < 0) return "discharging";
  if (snapshot.percent === 100) return null;
  return rate > 0 || snapshot.charging === true ? "charging" : null;
}

function batteryState(snapshot: BatterySnapshot, flow: BatteryFlow | null): BatteryState {
  if (flow === "discharging") return snapshot.pluggedIn === true ? "pluggedDischarging" : "onBattery";
  if (flow === "charging") return "charging";
  if (snapshot.percent === 100) return "full";
  if (snapshot.pluggedIn === null) return "unknown";
  return snapshot.charging === null ? "plugged" : "idle";
}

export function batteryHealth(fullMwh: number | null, designMwh: number | null): number | null {
  if (fullMwh === null || designMwh === null || fullMwh <= 0 || designMwh <= 0) return null;
  return Math.min(100, Math.round((fullMwh / designMwh) * 100));
}

/** Minutes to empty or to full at the rate the battery driver reports; null when it reports none that fits the flow. */
function driverMinutes(snapshot: BatterySnapshot, flow: BatteryFlow): number | null {
  const { remainingMwh = null, fullMwh = null, rateMw = null } = snapshot.details ?? {};
  if (remainingMwh === null || rateMw === null) return null;
  if (flow === "discharging") return rateMw < 0 ? Math.ceil(remainingMwh * 60 / -rateMw) : null;
  return rateMw > 0 && fullMwh !== null ? Math.ceil(Math.max(0, fullMwh - remainingMwh) * 60 / rateMw) : null;
}

/**
 * The time left comes from the first source that has one. On battery: Windows' own estimate (it is
 * smoothed over minutes), then the measured rate, then the driver's rate. Charging: Windows gives
 * none, so the measured rate, and until ten seconds of samples exist the driver's rate, which is
 * there from the first reading.
 */
export function summarizeBattery(snapshot: BatterySnapshot, estimate?: BatteryPowerEstimate | null) {
  const flow = getBatteryFlow(snapshot, estimate?.rateMw);
  const { percent, secondsRemaining } = snapshot;
  const systemMinutes = flow === "discharging" && secondsRemaining !== null ? Math.ceil(secondsRemaining / 60) : null;
  const minutes = flow === null ? null : (systemMinutes ?? estimate?.minutes ?? driverMinutes(snapshot, flow));
  const low = flow === "discharging" && percent !== null && percent <= 15;
  return { state: batteryState(snapshot, flow), flow, percent, minutes, low };
}

export type BatterySummary = ReturnType<typeof summarizeBattery>;
