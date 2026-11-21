import { useEffect, useRef, useState } from "react";
import { readDeviceBatteries } from "./api";
import { BATTERY_ALERT_MS, createLowBatteryState, takeLowBatteryAlert, type BatteryAlert } from "./lowBattery";

const SCAN_INTERVAL_MS = 180_000;

/**
 * One alert per discharge of each device at or below 20%, shown on the collapsed
 * island beside the usage alert; charging arms the next one.
 */
export function useLowBatteryAlert(enabled: boolean, canShow: boolean): BatteryAlert | null {
  const [alert, setAlert] = useState<BatteryAlert | null>(null);
  const state = useRef(createLowBatteryState());
  const lastScan = useRef(-Infinity);
  useEffect(() => {
    if (!enabled || !canShow) {
      setAlert(null);
      return;
    }
    let disposed = false;
    const scan = async () => {
      const now = performance.now();
      if (now - lastScan.current < SCAN_INTERVAL_MS) return;
      try {
        const result = await readDeviceBatteries();
        if (disposed) return;
        // A partial or failed scan can temporarily omit a device. Do not rearm it.
        if (result.errors.length > 0 && result.devices.length === 0) return;
        const next = takeLowBatteryAlert(state.current, result.devices, result.errors.length === 0);
        if (next) setAlert(next);
      } catch { /* The Devices page reports scan errors. */ }
      finally { if (!disposed) lastScan.current = now; }
    };
    void scan();
    const timer = window.setInterval(() => { void scan(); }, SCAN_INTERVAL_MS);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [enabled, canShow]);

  useEffect(() => {
    if (alert === null) return;
    const timer = window.setTimeout(() => setAlert(null), BATTERY_ALERT_MS);
    return () => window.clearTimeout(timer);
  }, [alert]);

  return enabled && canShow ? alert : null;
}
