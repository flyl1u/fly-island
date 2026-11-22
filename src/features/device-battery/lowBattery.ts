import type { BatteryDevice } from "./model";

/** A reading at or below this, not charging, raises one alert per discharge. */
export const LOW_BATTERY_PERCENT = 20;
/** Charging, or back at or above this, arms the next alert. */
export const LOW_BATTERY_RESET_PERCENT = 30;
/** How long the collapsed island shows the line. */
export const BATTERY_ALERT_MS = 6000;

export type BatteryAlert = { id: string; name: string; percent: number };

type Entry = { alerted: boolean };
export type LowBatteryState = Map<string, Entry>;

export function createLowBatteryState(): LowBatteryState {
  return new Map();
}

/**
 * The alert this reading raises, if any. A device alerts once while it stays at or
 * below 20%, so the 60-second poll does not nag; charging it or seeing it climb
 * past 30% arms the next alert.
 */
export function takeLowBatteryAlert(state: LowBatteryState, devices: BatteryDevice[], complete = true): BatteryAlert | null {
  const seen = new Set<string>();
  let alert: BatteryAlert | null = null;

  for (const device of devices) {
    seen.add(device.id);
    if (device.percent === null || device.state !== "current" || device.receiverOnly || device.unconfirmed) continue;

    const entry = state.get(device.id) ?? { alerted: false };
    state.set(device.id, entry);

    if (device.charging === true || device.percent >= LOW_BATTERY_RESET_PERCENT) {
      entry.alerted = false;
      continue;
    }
    if (device.percent > LOW_BATTERY_PERCENT || entry.alerted) continue;

    if (alert === null) {
      entry.alerted = true;
      alert = { id: device.id, name: device.name, percent: device.percent };
    }
  }

  if (complete) {
    for (const id of state.keys()) {
      if (!seen.has(id)) state.delete(id);
    }
  }
  return alert;
}
