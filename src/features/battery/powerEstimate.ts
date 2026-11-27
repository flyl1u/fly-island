import type { BatterySnapshot } from "./snapshot";

const MIN_SAMPLE_SPACING_MS = 2_000;
const MIN_ESTIMATE_SPAN_MS = 10_000;
const MAX_SAMPLE_GAP_MS = 20_000;
const ESTIMATE_WINDOW_MS = 24_000;
const HOUR_MS = 3_600_000;

type EnergySample = {
  at: number;
  pluggedIn: boolean | null;
  remainingMwh: number;
  fullMwh: number | null;
  designMwh: number | null;
};

export type BatteryEnergySamples = readonly EnergySample[];
export const EMPTY_BATTERY_ENERGY_SAMPLES: BatteryEnergySamples = [];

export type BatteryPowerEstimate = { rateMw: number; minutes: number | null };

export function recordBatteryEnergy(samples: BatteryEnergySamples, snapshot: BatterySnapshot | null, at: number): BatteryEnergySamples {
  const details = snapshot?.details;
  if (!snapshot || details?.remainingMwh == null) return EMPTY_BATTERY_ENERGY_SAMPLES;

  const { remainingMwh, fullMwh, designMwh } = details;
  const next = { at, pluggedIn: snapshot.pluggedIn, remainingMwh, fullMwh, designMwh };
  const previous = samples[samples.length - 1];
  if (!previous) return [next];

  const gap = at - previous.at;
  if (gap < 0 || gap > MAX_SAMPLE_GAP_MS || previous.pluggedIn !== next.pluggedIn
    || previous.fullMwh !== fullMwh || previous.designMwh !== designMwh) return [next];
  if (gap < MIN_SAMPLE_SPACING_MS) return samples;
  return [...samples.filter((sample) => at - sample.at <= ESTIMATE_WINDOW_MS), next];
}

export function estimateBatteryPower(samples: BatteryEnergySamples): BatteryPowerEstimate | null {
  const first = samples[0];
  const latest = samples[samples.length - 1];
  if (!first || !latest || latest.at - first.at < MIN_ESTIMATE_SPAN_MS) return null;

  const deltaMwh = latest.remainingMwh - first.remainingMwh;
  // Charging flags can stay set when a weak adapter cannot cover the load.
  if (deltaMwh === 0 || (deltaMwh > 0 && latest.pluggedIn === false)) return null;

  const rateMw = deltaMwh * HOUR_MS / (latest.at - first.at);
  const remainingEnergy = deltaMwh < 0 ? latest.remainingMwh
    : latest.fullMwh === null ? null : Math.max(0, latest.fullMwh - latest.remainingMwh);
  const minutes = remainingEnergy === null ? null : Math.ceil(remainingEnergy * 60 / Math.abs(rateMw));
  return { rateMw, minutes };
}
