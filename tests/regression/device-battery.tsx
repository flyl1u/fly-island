import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Channel } from "@tauri-apps/api/core";
import { mockIPC } from "@tauri-apps/api/mocks";
import { I18nProvider, LOCALE_STORAGE_KEY, TRANSLATIONS } from "../../src/i18n";
import { DeviceBatteryPanel } from "../../src/features/device-battery";
import { DeviceDashboard } from "../../src/features/device-battery";
import { DevicesSettingsPage } from "../../src/windows/settings/DevicesSettingsPage";
import { MusicPlayerPanel } from "../../src/features/media/MusicPlayerPanel";
import { DEFAULT_MEDIA_STATE } from "../../src/features/media/mediaState";
import { IslandHeader } from "../../src/windows/island/IslandHeader";
import type { IslandPage } from "../../src/windows/island/types";
import { DEVICE_BATTERY_KEY, saveDeviceBatterySettings } from "../../src/features/device-battery/storage";
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import "../../src/windows/island/IslandApp.css";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const params = new URLSearchParams(location.search);
const locale = params.get("lang") === "en" ? "en" : "zh-CN";
localStorage.setItem(LOCALE_STORAGE_KEY, locale);
if (params.get("theme") === "light") document.documentElement.dataset.tone = "light";
document.body.style.background = "var(--color-surface-dark)";
document.body.style.color = "var(--text-1)";
document.body.style.font = '14px "Segoe UI", "Microsoft YaHei", sans-serif';
document.getElementById("fixture")!.style.margin = "24px";
const t = TRANSLATIONS[locale].deviceBattery;
const calls: string[] = [];
let current = "speaker-id";
let failSwitch = false;
let headsetAvailable = true;
let audioDelay = 20;
let completeBatteryRead: (() => void) | undefined;
let holdBatteryRead = false;
let failBatteryRead = false;
const audioBindings: string[] = [];
mockIPC(async (command, payload) => {
  calls.push(command);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const args = payload as { target?: string | null };
  if (command === "get_media_diagnostics") return { players: [] };
  if (command === "get_lyrics") return { source: "lrclib", lrc: "[00:01.00]First line\n[00:05.00]A lyric line\n[00:09.00]Last line" };
  if (command === "plugin:event|listen") return 1;
  if (command === "plugin:event|unlisten") return null;
  if (command === "device_battery_audio") {
    audioBindings.push(String((payload as { speakerId: string }).speakerId));
    await new Promise((resolve) => setTimeout(resolve, audioDelay));
    if (args.target && !failSwitch) current = `${args.target}-id`;
    return { OperationSucceeded: !failSwitch, ConsoleOutputId: current, Error: failSwitch ? "Switch failed; original output restored" : null,
      Devices: [{ Id: "speaker-id", Name: "Speakers", Flow: 0 }, { Id: "speaker-alt", Name: "Desk speakers", Flow: 0 }, ...(headsetAvailable ? [{ Id: "headset-id", Name: "Headphones", Flow: 0 }] : []), { Id: "mic", Name: "Microphone", Flow: 1 }] };
  }
  if (command === "device_battery_read") {
    if (failBatteryRead) throw new Error("Battery reader timed out");
    const mouse = { id: "mouse", name: "A very long wireless mouse name that must remain inside the narrow island", kind: "mouse", percent: 72, approximate: true, measurementState: "cached" };
    if (holdBatteryRead) {
      const { progress } = payload as { progress: Channel<unknown> };
      progress.onmessage({ devices: [mouse], errors: [] });
      await new Promise<void>((resolve) => { completeBatteryRead = resolve; });
    }
    return { devices: [mouse,
      { id: "headset", name: "Headphones", kind: "headset", percent: null, measurementState: "unknown", receiverOnly: true },
    ], errors: [] };
  }
  throw new Error(`Unexpected command: ${command}`);
}, { shouldMockEvents: true });
const messages: string[] = [];
const root = createRoot(document.getElementById("fixture")!);
const settings = { enabled: true, directory: "D:\\test-plugin", speakerId: "speaker-id", headsetId: "headset-id" };
function check(condition: unknown, label: string) { if (!condition) throw new Error(label); messages.push(`PASS ${label}`); }
const wait = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 70)); });
const render = (showSettings = false) => act(async () => root.render(<StrictMode><I18nProvider>{showSettings ? <DevicesSettingsPage /> : <DeviceBatteryPanel />}</I18nProvider></StrictMode>));
function IslandDevicePreview({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [page, setPage] = useState<IslandPage>("music");
  const noop = () => {};
  return <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
    <IslandHeader isExpanded page={page} features={{ todo: false, music: false, devices: true, clipboard: false, shelf: false, qq: false, wechat: false, qqMail: false, agents: false, translation: false }}
      pageOrder={["devices"]} pageButtonStyle="icon" onPageOrderChange={noop} showTitle={false} isDetached={false}
      agentVisualState="idle" agentStatusLabel="" qqNotificationCount={0} wechatPending={false} officePending={null}
      onPageChange={setPage} onCollapse={noop} onOpenSettings={onOpenSettings} onOpenMessages={noop} onOpenTranslator={null} onResetPosition={noop} minimizesToTray={false} onMinimize={noop} />
    <div style={{ flex: 1, minHeight: 0 }}>{page === "devices" && <DeviceDashboard onOpenSettings={onOpenSettings} />}</div>
  </div>;
}
try {
  saveDeviceBatterySettings({ ...settings, enabled: false });
  await render(); await wait();
  check(!document.querySelector(".device-battery") && calls.length === 0, "disabled plugin renders nothing and sends no IPC");
  await act(async () => { saveDeviceBatterySettings(settings); }); await wait();
  check(calls.length === 2, "StrictMode shares each initial native query and receives its result");
  const buttons = document.querySelectorAll<HTMLButtonElement>(".device-battery__toolbar > button");
  check(buttons[0].getAttribute("aria-pressed") === "true" && !buttons[1].disabled, "bound active outputs are usable");
  await act(async () => buttons[1].click()); await wait();
  check(current === "headset-id" && buttons[1].getAttribute("aria-pressed") === "true", "headphone click uses verified readback");
  failSwitch = true;
  await act(async () => buttons[0].click()); await wait();
  check(current === "headset-id" && document.querySelector("[role=alert]")?.textContent?.includes("restored"), "failed switch preserves readback and reports rollback");
  const summary = document.querySelector<HTMLElement>(".device-battery summary")!;
  await act(async () => summary.click());
  check(document.querySelector(".device-battery__list")?.textContent?.includes("≈72%") && document.querySelector(".device-battery__list")?.textContent?.includes(t.unknown), "cached estimates and unknown batteries are distinct");
  const fixture = document.getElementById("fixture")!;
  check(fixture.scrollWidth <= fixture.clientWidth, "long device names fit a 300px island");
  await act(async () => { saveDeviceBatterySettings({ ...settings, enabled: false }); });
  const count = calls.length; await wait();
  check(!document.querySelector(".device-battery") && calls.length === count, "disable unmounts controls without another query");
  failSwitch = false;
  await act(async () => { saveDeviceBatterySettings(settings); });
  await render(true); await wait();
  check(document.body.textContent?.includes(t.speaker) && document.body.textContent?.includes(t.headset), "settings exposes both localized bindings");
  check(document.body.textContent?.includes(t.batteries) && document.body.textContent?.includes("≈72%"), "dedicated device page displays battery readings and audio controls together");
  const batteryCalls = calls.filter((call) => call === "device_battery_read").length;
  const chooseSpeaker = async (id: string) => {
    await act(async () => document.querySelector<HTMLButtonElement>(`[role=combobox][aria-label='${t.speaker}']`)!.click());
    await act(async () => document.querySelector<HTMLElement>(`[role=option][data-value='${id}']`)!.click());
  };
  audioDelay = 120;
  await chooseSpeaker("speaker-alt");
  check(document.querySelector(`[role=combobox][aria-label='${t.speaker}']`)?.textContent?.includes("Desk speakers")
    && document.body.textContent?.includes("≈72%"), "binding change keeps the selected label, output list and battery readings visible");
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 190)); });
  check(audioBindings[audioBindings.length - 1] === "speaker-alt" && !document.querySelector<HTMLButtonElement>(`[role=combobox][aria-label='${t.headset}']`)!.disabled,
    "new binding is queried automatically without pressing Refresh");
  await chooseSpeaker("speaker-id");
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 190)); });
  check(audioBindings[audioBindings.length - 1] === "speaker-id" && calls.filter((call) => call === "device_battery_read").length === batteryCalls,
    "repeated binding changes refresh audio automatically without restarting battery polling");
  const beforeSave = localStorage.getItem(DEVICE_BATTERY_KEY);
  await act(async () => [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === t.save)!.click()); await wait();
  check(localStorage.getItem(DEVICE_BATTERY_KEY) === beforeSave && document.querySelector(`[role=group][aria-label='${t.switchOutput}']`),
    "saving the same plugin directory preserves enabled state and device bindings");
  audioDelay = 20;
  const choices = document.querySelectorAll<HTMLButtonElement>(`[role=group][aria-label='${t.switchOutput}'] button`);
  check(choices.length === 2 && choices[1].getAttribute("aria-pressed") === "true", "device page exposes switches with the verified current output selected");
  await act(async () => choices[0].click());
  check([...choices].every((button) => button.disabled), "device page prevents concurrent switches during native readback");
  await wait();
  check(current === "speaker-id" && choices[0].getAttribute("aria-pressed") === "true", "device page switches to speakers");
  await act(async () => choices[1].click()); await wait();
  check(current === "headset-id" && choices[1].getAttribute("aria-pressed") === "true", "device page switches back to headphones");
  failSwitch = true;
  await act(async () => choices[0].click()); await wait();
  check(current === "headset-id" && choices[1].getAttribute("aria-pressed") === "true" && document.querySelector("[role=alert]")?.textContent?.includes("restored"), "device page preserves selection and reports a failed switch");
  failSwitch = false; headsetAvailable = false;
  const refresh = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === t.refresh)!;
  await act(async () => refresh.click()); await wait();
  const beforeOfflineClick = calls.length;
  await act(async () => choices[1].click()); await wait();
  check(choices[1].disabled && calls.length === beforeOfflineClick, "device page disables a bound output that is no longer active");
  check(calls.filter((call) => call === "device_battery_read").length === batteryCalls && fixture.scrollWidth <= fixture.clientWidth,
    "device-page audio switching does not restart battery polling or overflow the narrow layout");
  headsetAvailable = true;
  fixture.style.width = params.has("narrow") ? "300px" : "520px";
  fixture.style.height = "234px";
  const noop = () => {};
  await act(async () => root.render(<StrictMode><I18nProvider><MusicPlayerPanel
    mediaState={{ ...DEFAULT_MEDIA_STATE, available: true, title: "A song for the device plugin", artist: "Preview", durationMs: 180_000, positionMs: 6000, updatedAt: Date.now() }}
    isTrackChanging={false} commandError={null} onOpenSettings={noop} onPlayPause={noop} onNext={noop} onPrevious={noop}
    lyricsSettings={{ lyricsFolder: "", lyricsOnline: true, lyricsOffsetMs: 0 }}
  /></I18nProvider></StrictMode>)); await wait();
  const musicButtons = document.querySelector<HTMLElement>(".music-player__controls")!;
  const bar = document.querySelector<HTMLElement>(".device-battery")!;
  check(musicButtons.getBoundingClientRect().bottom <= fixture.getBoundingClientRect().bottom + 1, "transport controls stay inside the 234px music page");
  check(bar.getBoundingClientRect().bottom <= fixture.getBoundingClientRect().bottom + 1 && fixture.scrollWidth <= fixture.clientWidth, "enabled plugin fits the music page without horizontal overflow");
  const beforeHidden = calls.length;
  await act(async () => root.render(<StrictMode><I18nProvider><DeviceBatteryPanel active={false} /></I18nProvider></StrictMode>)); await wait();
  check(!document.querySelector(".device-battery") && calls.length === beforeHidden, "collapsed music shortcuts stop device queries");
  fixture.style.height = "334px";
  let deviceSettingsOpened = false;
  await act(async () => root.render(<StrictMode><I18nProvider><IslandDevicePreview onOpenSettings={() => { deviceSettingsOpened = true; }} /></I18nProvider></StrictMode>));
  const devicePageButton = document.querySelector<HTMLButtonElement>(".dot-button--devices")!;
  holdBatteryRead = true;
  await act(async () => devicePageButton.click()); await wait();
  check(devicePageButton.getAttribute("aria-current") === "page", "the island header opens and selects the dedicated device page");
  check(completeBatteryRead && document.querySelector(".device-dashboard__cards[aria-busy=true] [role=progressbar]"),
    "the mouse reading appears while slower readers are still running");
  holdBatteryRead = false;
  await act(async () => completeBatteryRead?.()); await wait();
  check(document.querySelectorAll(".device-dashboard__card").length === 2 && document.querySelectorAll(".device-dashboard [role=progressbar]").length === 1,
    "island device page shows real battery cards and does not invent a bar for unknown percentages");
  check(document.querySelector(".device-dashboard")?.textContent?.includes(t.receiverOnly),
    "a detected receiver without a battery reply stays visible with an explicit status");
  failBatteryRead = true;
  await act(async () => document.querySelector<HTMLButtonElement>(".device-dashboard__footer button")!.click()); await wait();
  check(document.querySelectorAll(".device-dashboard__card").length === 2 && document.querySelector("[role=alert]")?.textContent?.includes("timed out"),
    "a failed refresh retains the previous battery readings and reports the failure");
  failBatteryRead = false;
  await act(async () => document.querySelector<HTMLButtonElement>(".device-dashboard__footer button")!.click()); await wait();
  check(!document.querySelector("[role=alert]"), "a successful retry clears the battery error");
  const dashboardOutputs = document.querySelectorAll<HTMLButtonElement>(".device-dashboard__outputs button");
  await act(async () => dashboardOutputs[0].click()); await wait();
  check(current === "speaker-id" && dashboardOutputs[0].getAttribute("aria-pressed") === "true", "island device page switches outputs and reflects native readback");
  await act(async () => document.querySelector<HTMLButtonElement>(".device-dashboard__footer button:last-child")!.click());
  check(deviceSettingsOpened && fixture.scrollWidth <= fixture.clientWidth && document.querySelector(".device-dashboard")!.getBoundingClientRect().bottom <= fixture.getBoundingClientRect().bottom + 1,
    "island device page opens its settings and fits both narrow and full island layouts");
  document.documentElement.dataset.testResult = "passed";
  document.getElementById("results")!.textContent = [...messages, "ALL PASS"].join("\n");
} catch (error) {
  document.documentElement.dataset.testResult = "failed";
  document.getElementById("results")!.textContent = [...messages, `FAIL ${String(error)}`].join("\n");
} finally {
  // The shared regression browser reuses this origin for later music/settings pages.
  if (!params.has("preview")) {
    await act(async () => root.unmount());
    localStorage.removeItem(DEVICE_BATTERY_KEY);
  }
}
