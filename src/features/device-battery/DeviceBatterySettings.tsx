import { useState } from "react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsSelect } from "../../components/settings/SettingsSelect";
import { SettingsChoice } from "../../components/settings/SettingsChoice";
import { useTranslation } from "../../i18n";
import { saveDeviceBatterySettings, useDeviceBatterySettings } from "./storage";
import { useDeviceBattery } from "./useDeviceBattery";

const AUDIO_OUTPUTS = { speaker: "speakerId", headset: "headsetId" } as const;
const AUDIO_ROLES = ["speaker", "headset"] as const;

export function DeviceBatterySettings() {
  const settings = useDeviceBatterySettings();
  const t = useTranslation().deviceBattery;
  const [error, setError] = useState("");
  const save = (next: typeof settings) => { if (!saveDeviceBatterySettings(next)) setError(t.saveFailed); else setError(""); };
  return <SettingsGroup title={t.title} footer={t.trust}>
    <DeviceAudioBindings settings={settings} onSave={save} />
    {error && <p role="alert">{error}</p>}
  </SettingsGroup>;
}
function DeviceAudioBindings({ settings, onSave }: {
  settings: ReturnType<typeof useDeviceBatterySettings>;
  onSave: (settings: ReturnType<typeof useDeviceBatterySettings>) => void;
}) {
  const t = useTranslation().deviceBattery;
  const { audio, audioBusy, audioError, refreshAudio, battery, batteryBusy, batteryError, refreshBattery } = useDeviceBattery(settings);
  const currentRole = AUDIO_ROLES.find((role) => settings[AUDIO_OUTPUTS[role]] && audio?.currentId === settings[AUDIO_OUTPUTS[role]]) ?? "";
  return <>
    {AUDIO_ROLES.map((role) => <SettingsRow key={role} title={t[role]} control={<SettingsSelect
      ariaLabel={t[role]} value={settings[AUDIO_OUTPUTS[role]]}
      disabled={audioBusy} options={[{ value: "", label: t.bind }, ...(audio?.devices ?? []).map((d) => ({ value: d.id, label: d.name }))]}
      onChange={(id) => { onSave({ ...settings, [AUDIO_OUTPUTS[role]]: id }); }}
    />} />)}
    <SettingsRow title={t.switchOutput} description={t.automatic}>
      <SettingsChoice ariaLabel={t.switchOutput} value={currentRole}
        options={AUDIO_ROLES.map((role) => ({
          value: role, label: t[role], disabled: audioBusy || !audio?.devices.some((device) => device.id === settings[AUDIO_OUTPUTS[role]]),
        }))}
        onChange={(target) => { if (target === "speaker" || target === "headset") void refreshAudio(target); }}
      />
    </SettingsRow>
    <SettingsRow title={t.current} description={audio?.devices.find((d) => d.id === audio.currentId)?.name ?? t.unknown}
      control={<SettingsLinkButton disabled={audioBusy} onClick={() => { void refreshAudio(); }}>{t.refresh}</SettingsLinkButton>} />
    {audioError && <p role="alert">{audioError}</p>}
    <SettingsRow title={t.batteries} control={<SettingsLinkButton disabled={batteryBusy} onClick={() => { void refreshBattery(); }}>{batteryBusy ? t.refreshing : t.refresh}</SettingsLinkButton>} />
    {battery?.devices.map((device) => <SettingsRow key={device.id} title={device.name}
      description={[device.receiverOnly ? t.receiverOnly : "", device.state === "cached" ? t.cached : "", device.unconfirmed ? t.unconfirmed : "", device.charging === true ? t.charging : ""].filter(Boolean).join(" · ")}
      control={<span>{device.percent === null ? t.unknown : `${device.approximate ? "≈" : ""}${device.percent}%`}</span>} />)}
    {!battery?.devices.length && <SettingsRow title={batteryBusy ? t.refreshing : t.empty} />}
    {batteryError && <p role="alert">{batteryError}</p>}
  </>;
}
