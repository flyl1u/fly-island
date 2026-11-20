import { useEffect, useRef, useState } from "react";
import type { BatteryDevice } from "./model";
import { BATTERY_ALERT_MS, createLowBatteryState, takeLowBatteryAlert, type BatteryAlert } from "./lowBattery";

/**
 * One alert per discharge of each device at or below 20%, shown on the collapsed
 * island beside the usage alert; charging arms the next one.
 */
export function useLowBatteryAlert(devices: BatteryDevice[] | undefined): BatteryAlert | null {
  const [alert, setAlert] = useState<BatteryAlert | null>(null);
  const state = useRef(createLowBatteryState());

  useEffect(() => {
    if (!devices) return;
    const next = takeLowBatteryAlert(state.current, devices);
    if (next !== null) setAlert(next);
  }, [devices]);

  useEffect(() => {
    if (alert === null) return;
    const timer = window.setTimeout(() => setAlert(null), BATTERY_ALERT_MS);
    return () => window.clearTimeout(timer);
  }, [alert]);

  return alert;
}
