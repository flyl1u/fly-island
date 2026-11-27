import { useEffect, useState } from "react";
import { getBatteryFlow } from "./display";
import { EMPTY_BATTERY_HISTORY, recordBatterySample } from "./history";
import { EMPTY_BATTERY_ENERGY_SAMPLES, estimateBatteryPower, recordBatteryEnergy } from "./powerEstimate";
import type { BatterySnapshot, ReadBatterySnapshot } from "./snapshot";

const BACKGROUND_REFRESH_MS = 10_000;
const VISIBLE_REFRESH_MS = 5_000;
const ENERGY_REFRESH_MS = 3_000;
const UNAVAILABLE: BatterySnapshot = {
  percent: null,
  pluggedIn: null,
  charging: null,
  secondsRemaining: null,
  details: null,
};

type BatteryObservation = {
  enabled: boolean;
  paused: boolean;
  includeDetails: boolean;
  observing: boolean;
  recordHistory: boolean;
};

type BatterySource = {
  read: ReadBatterySnapshot;
  isVisible: () => Promise<boolean>;
};

export function useBatterySnapshot(
  { enabled, paused, includeDetails, observing, recordHistory }: BatteryObservation,
  { read, isVisible }: BatterySource,
) {
  const [{ snapshot, history, energySamples }, setObservation] = useState({
    snapshot: null as BatterySnapshot | null,
    history: EMPTY_BATTERY_HISTORY,
    energySamples: EMPTY_BATTERY_ENERGY_SAMPLES,
  });
  const recording = enabled && recordHistory;

  useEffect(() => {
    if (!recording) setObservation((previous) => ({ ...previous, history: EMPTY_BATTERY_HISTORY }));
  }, [recording]);

  useEffect(() => {
    if (!enabled) {
      setObservation((previous) => ({ ...previous, snapshot: null, energySamples: EMPTY_BATTERY_ENERGY_SAMPLES }));
      return;
    }
    if (paused && !recording) {
      setObservation((previous) => ({ ...previous, energySamples: EMPTY_BATTERY_ENERGY_SAMPLES }));
      return;
    }
    let disposed = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (disposed || inFlight || (!recording && document.hidden)) return;
      inFlight = true;
      let delay = BACKGROUND_REFRESH_MS;
      try {
        if ((!recording && !await isVisible()) || disposed) return;
        const readEnergy = includeDetails && !document.hidden;
        if (readEnergy) delay = VISIBLE_REFRESH_MS;
        const latest = await read(readEnergy);
        if (readEnergy && latest?.details?.remainingMwh != null && getBatteryFlow(latest)) delay = ENERGY_REFRESH_MS;
        if (!disposed) {
          const at = performance.now();
          const wallTime = Date.now();
          setObservation((previous) => {
            const energySamples = readEnergy ? recordBatteryEnergy(previous.energySamples, latest, at) : EMPTY_BATTERY_ENERGY_SAMPLES;
            const snapshot = JSON.stringify(previous.snapshot) === JSON.stringify(latest) ? previous.snapshot : latest;
            let history = previous.history;
            if (recording && latest?.percent != null) {
              const flow = getBatteryFlow(latest, estimateBatteryPower(energySamples)?.rateMw);
              history = recordBatterySample(history, { at: wallTime, percent: latest.percent, flow });
            }
            if (snapshot === previous.snapshot && energySamples === previous.energySamples && history === previous.history) return previous;
            return { snapshot, energySamples, history };
          });
        }
      } catch {
        if (!disposed) {
          setObservation((previous) => ({
            ...previous,
            snapshot: previous.snapshot ? UNAVAILABLE : null,
            energySamples: EMPTY_BATTERY_ENERGY_SAMPLES,
          }));
        }
      } finally {
        inFlight = false;
        if (!disposed && (recording || (observing && !document.hidden))) timer = setTimeout(() => void refresh(), delay);
      }
    };
    const resume = () => {
      clearTimeout(timer);
      void refresh();
    };
    void refresh();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    return () => {
      disposed = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
    };
  }, [enabled, includeDetails, paused, observing, recording, read, isVisible]);

  return {
    snapshot: enabled ? snapshot : null,
    history: recording ? history : EMPTY_BATTERY_HISTORY,
    estimate: enabled && includeDetails && snapshot?.details ? estimateBatteryPower(energySamples) : null,
  };
}
