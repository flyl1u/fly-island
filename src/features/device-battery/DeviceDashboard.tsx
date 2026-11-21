import { Battery, Headphones, Keyboard, Mouse, RefreshCw, SlidersHorizontal, Volume2 } from "lucide-react";
import { useTranslation } from "../../i18n";
import { useDeviceBatterySettings } from "./storage";
import { useDeviceBattery } from "./useDeviceBattery";
import "./DeviceDashboard.css";

export function DeviceDashboard({ onOpenSettings }: { onOpenSettings: () => void }) {
  const settings = useDeviceBatterySettings();
  const t = useTranslation().deviceBattery;

  const state = useDeviceBattery(settings);
  const currentOutput = state.audio?.devices.find((device) => device.id === state.audio?.currentId)?.name ?? t.unknown;
  return <section className="device-dashboard" aria-label={t.title}>
    <div className="device-dashboard__cards" aria-busy={state.batteryBusy}>
      {state.battery?.devices.map((device) => {
        const Icon = device.kind === "mouse" ? Mouse : device.kind === "headset" ? Headphones : device.kind === "keyboard" ? Keyboard : Battery;
        const status = [device.receiverOnly ? t.receiverOnly : "", device.charging === true ? t.charging : "", device.state === "cached" ? t.cached : "", device.unconfirmed ? t.unconfirmed : ""].filter(Boolean).join(" · ");
        return <article className="device-dashboard__card" key={device.id} data-state={device.state}>
          <div className="device-dashboard__card-top"><Icon size={20} strokeWidth={1.5} aria-hidden="true" /><span className="device-dashboard__name" title={device.name}>{device.name}</span></div>
          <div className="device-dashboard__level">{device.percent === null ? <span className="device-dashboard__unknown">{t.unknown}</span> : <>{device.approximate ? "≈" : ""}{device.percent}<span className="device-dashboard__percent">%</span></>}</div>
          {device.percent !== null && <div className="device-dashboard__meter" role="progressbar" aria-label={device.name} aria-valuenow={device.percent} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${device.percent}%` }} />
          </div>}
          {status && <span className="device-dashboard__status">{status}</span>}
        </article>;
      })}
      {!state.battery?.devices.length && <div className="device-dashboard__empty" role="status"><Battery size={28} strokeWidth={1.5} aria-hidden="true" /><span>{state.batteryBusy ? t.refreshing : t.empty}</span></div>}
    </div>
    <div className="device-dashboard__audio">
      <div className="device-dashboard__audio-title"><span>{t.current}</span><span title={currentOutput}>{currentOutput}</span></div>
      <div className="device-dashboard__outputs" role="group" aria-label={t.switchOutput}>
        {(["speaker", "headset"] as const).map((target) => {
          const id = target === "speaker" ? settings.speakerId : settings.headsetId;
          const Icon = target === "speaker" ? Volume2 : Headphones;
          const available = state.audio?.devices.some((device) => device.id === id);
          return <button type="button" key={target} aria-pressed={Boolean(id && state.audio?.currentId === id)} disabled={!available || state.audioBusy}
            onClick={() => { void state.refreshAudio(target); }}><Icon size={17} strokeWidth={1.5} aria-hidden="true" />{t[target]}</button>;
        })}
      </div>
    </div>
    {(state.audioError || state.batteryError) && <p className="device-dashboard__error" role="alert">{[state.audioError, state.batteryError].filter(Boolean).join(" · ")}</p>}
    <footer className="device-dashboard__footer">
      <button type="button" disabled={state.batteryBusy || state.audioBusy} onClick={() => { void state.refreshAudio(); void state.refreshBattery(); }}><RefreshCw size={14} aria-hidden="true" />{state.batteryBusy ? t.refreshing : t.refresh}</button>
      <button type="button" onClick={onOpenSettings}><SlidersHorizontal size={14} aria-hidden="true" />{t.deviceSettings}</button>
    </footer>
  </section>;
}
