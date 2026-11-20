import { Battery, Headphones, RefreshCw, Volume2 } from "lucide-react";
import { useTranslation } from "../../i18n";
import { useDeviceBatterySettings } from "./storage";
import { useDeviceBattery } from "./useDeviceBattery";
import type { DeviceBatterySettings } from "./model";
import "./DeviceBatteryPanel.css";

export function DeviceBatteryPanel({ active = true }: { active?: boolean }) {
  const settings = useDeviceBatterySettings();
  return settings.enabled && active ? <ActiveDeviceBatteryPanel key={settings.directory} settings={settings} /> : null;
}
function ActiveDeviceBatteryPanel({ settings }: { settings: DeviceBatterySettings }) {
  const t = useTranslation().deviceBattery;
  const state = useDeviceBattery(settings);
  const lowest = state.battery?.devices.filter((device) => device.percent !== null).sort((a, b) => (a.percent ?? 0) - (b.percent ?? 0))[0];
  return <section className="device-battery" aria-label={t.title}>
    <div className="device-battery__toolbar">
      {(["speaker", "headset"] as const).map((target) => {
        const id = target === "speaker" ? settings.speakerId : settings.headsetId;
        const available = state.audio?.devices.some((device) => device.id === id);
        const Icon = target === "speaker" ? Volume2 : Headphones;
        return <button type="button" key={target} aria-label={t[target]} title={t[target]} disabled={!available || state.audioBusy} aria-pressed={Boolean(id && state.audio?.currentId === id)} onClick={() => { void state.refreshAudio(target); }}>
          <Icon size={14} aria-hidden="true" /><span className="device-battery__label">{t[target]}</span>
        </button>;
      })}
      <details className="device-battery__details">
        <summary aria-label={t.title}><Battery size={14} aria-hidden="true" />{state.batteryBusy ? "…" : lowest ? `${lowest.approximate ? "≈" : ""}${lowest.percent}%` : t.unknown}
          {lowest?.state === "cached" && <span className="device-battery__meta">{t.cached}</span>}
          {lowest?.unconfirmed && <span className="device-battery__meta">{t.unconfirmed}</span>}
        </summary>
        <div className="device-battery__readings">
          <ul className="device-battery__list" aria-busy={state.batteryBusy}>
            {state.battery?.devices.map((device) => <li key={device.id}>
              <Battery size={14} aria-hidden="true" /><span className="device-battery__name" title={`${device.name}${device.confirmedAt ? ` · ${t.checked}: ${device.confirmedAt}` : ""}`}>{device.name}</span>
              <span>{device.percent === null ? t.unknown : `${device.approximate ? "≈" : ""}${device.percent}%`}</span>
              {device.charging === true && <span className="device-battery__meta">{t.charging}</span>}
              {device.state === "cached" && <span className="device-battery__meta">{t.cached}</span>}
              {device.unconfirmed && <span className="device-battery__meta">{t.unconfirmed}</span>}
              {device.receiverOnly && <span className="device-battery__meta">{t.receiverOnly}</span>}
            </li>)}
          </ul>
          {!state.battery?.devices.length && <p className="device-battery__meta" role="status">{state.batteryBusy ? t.refreshing : t.empty}</p>}
          {state.batteryError && <p className="device-battery__error" role="alert">{state.batteryError}</p>}
        </div>
      </details>
      <button type="button" aria-label={t.refresh} title={t.refresh} disabled={state.batteryBusy || state.audioBusy} onClick={() => { void state.refreshAudio(); void state.refreshBattery(); }}><RefreshCw size={14} /></button>
    </div>
    {state.audioError && <p className="device-battery__error" role="alert">{state.audioError}</p>}
  </section>;
}
