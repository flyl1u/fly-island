import { useCallback, useEffect, useRef, useState } from "react";
import { readDeviceAudio, readDeviceBatteries } from "./api";
import type { AudioSnapshot, BatterySnapshot, DeviceBatterySettings } from "./model";

/** Bluetooth scanning times out on machines without Bluetooth devices; it is not a user-facing error. */
const HIDDEN_BATTERY_ERRORS = new Set(["bluetooth: timeout"]);
const visibleBatteryErrors = (errors: string[]) => errors.filter((error) => !HIDDEN_BATTERY_ERRORS.has(error));

export function useDeviceBattery(settings: DeviceBatterySettings, queryBattery = true) {
  const { enabled, directory, speakerId, headsetId } = settings;
  const [audio, setAudio] = useState<AudioSnapshot | null>(null);
  const [battery, setBattery] = useState<BatterySnapshot | null>(null);
  const [audioBusy, setAudioBusy] = useState(false);
  const [batteryBusy, setBatteryBusy] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [batteryError, setBatteryError] = useState("");
  const generation = useRef(0);
  const batteryGeneration = useRef(0);
  const pending = useRef({ audio: -1, battery: -1 });
  const refreshAudio = useCallback(async (target: "speaker" | "headset" | null = null) => {
    const version = generation.current;
    if (!enabled || pending.current.audio === version) return;
    pending.current.audio = version; setAudioBusy(true);
    try {
      const value = await readDeviceAudio({ enabled, directory, speakerId, headsetId }, target);
      if (version === generation.current) { setAudio(value); setAudioError(value.error); }
    } catch (e) { if (version === generation.current) { setAudio(null); setAudioError(String(e)); } }
    finally { if (pending.current.audio === version) pending.current.audio = -1; if (version === generation.current) setAudioBusy(false); }
  }, [enabled, directory, speakerId, headsetId]);
  const refreshBattery = useCallback(async () => {
    const version = batteryGeneration.current;
    if (!enabled || !queryBattery || pending.current.battery === version) return;
    pending.current.battery = version; setBatteryBusy(true);
    try {
      const value = await readDeviceBatteries(directory, (snapshot) => {
        if (version === batteryGeneration.current) { setBattery(snapshot); setBatteryError(visibleBatteryErrors(snapshot.errors).join(" · ")); }
      });
      if (version === batteryGeneration.current) { setBattery(value); setBatteryError(visibleBatteryErrors(value.errors).join(" · ")); }
    } catch (e) { if (version === batteryGeneration.current) setBatteryError(String(e)); }
    finally { if (pending.current.battery === version) pending.current.battery = -1; if (version === batteryGeneration.current) setBatteryBusy(false); }
  }, [enabled, directory, queryBattery]);
  useEffect(() => {
    const version = ++generation.current;
    if (!enabled) { setAudio(null); setAudioError(""); }
    void refreshAudio();
    const timer = enabled ? window.setInterval(() => { void refreshAudio(); }, 5000) : undefined;
    const onFocus = () => { void refreshAudio(); };
    window.addEventListener("focus", onFocus);
    return () => { generation.current = version + 1; window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [enabled, refreshAudio]);
  useEffect(() => {
    const version = ++batteryGeneration.current;
    if (!enabled || !queryBattery) { setBattery(null); setBatteryError(""); }
    void refreshBattery();
    const timer = enabled && queryBattery ? window.setInterval(() => { void refreshBattery(); }, 60_000) : undefined;
    return () => { batteryGeneration.current = version + 1; window.clearInterval(timer); };
  }, [enabled, queryBattery, refreshBattery]);
  return { audio, battery, audioBusy, batteryBusy, audioError, batteryError, refreshAudio, refreshBattery };
}
