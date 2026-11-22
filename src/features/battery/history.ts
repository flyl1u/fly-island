import type { BatteryFlow } from "./display";

export type BatterySample = { at: number; percent: number; flow: BatteryFlow | null };
export type BatteryHistory = { points: readonly BatterySample[]; intervalMs: number };

const MAX_POINTS = 1440;
/** How far back the chart looks; a session that has run for days would flatten today's curve. */
export const BATTERY_HISTORY_HOURS = 24;
export const EMPTY_BATTERY_HISTORY: BatteryHistory = { points: [], intervalMs: 30_000 };

export function recordBatterySample(history: BatteryHistory, sample: BatterySample): BatteryHistory {
  const { points, intervalMs } = history;
  const previous = points[points.length - 1];
  if (previous && sample.at - previous.at < intervalMs) return history;
  if (points.length < MAX_POINTS) return { points: [...points, sample], intervalMs };

  // Keep the start of the session and make room for new readings at a lower resolution.
  return { points: [...points.filter((_, index) => index % 2 === 0), sample], intervalMs: intervalMs * 2 };
}

export function batteryHistoryInRange(history: BatteryHistory, hours: number, now: number) {
  if (hours === 0) return history.points;
  const start = now - hours * 3_600_000;
  return history.points.filter((point) => point.at >= start);
}

export function nearestBatterySample(points: BatteryHistory["points"], at: number): number {
  if (points.length === 0) return -1;
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const midpoint = (points[middle].at + points[middle + 1].at) / 2;
    if (at <= midpoint) high = middle;
    else low = middle + 1;
  }
  return low;
}
