import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { Channel } from "@tauri-apps/api/core";
import { mockIPC } from "@tauri-apps/api/mocks";
import { I18nProvider, LOCALE_STORAGE_KEY, TRANSLATIONS } from "../../src/i18n";
import { DeviceDashboard } from "../../src/features/device-battery/DeviceDashboard";
import { DeviceBatterySettings } from "../../src/features/device-battery/DeviceBatterySettings";
import { saveDeviceBatterySettings } from "../../src/features/device-battery/storage";
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const params = new URLSearchParams(location.search);
const locale = params.get("lang") === "en" ? "en" : "zh-CN";
localStorage.setItem(LOCALE_STORAGE_KEY, locale);
if (params.get("theme") === "light") document.documentElement.dataset.tone = "light";
document.body.style.background = "var(--color-surface-dark)";
document.body.style.color = "var(--text-1)";
const t = TRANSLATIONS[locale].deviceBattery;
const calls: string[] = [];
let current = "speakers";
let fail = false;
let releaseBattery: (() => void) | undefined;
let openSettings = 0;
const mouse = { id: "mouse", name: "Wireless mouse with a long device name", percent: 72, approximate: true, measurementState: "cached" };
const headset = { id: "headset", name: "Headset", percent: null, receiverOnly: true };
mockIPC(async (command, payload) => {
  calls.push(command);
  await Promise.resolve();
  if (command === "device_battery_audio") {
    const args = payload as { target: "headset" | "speaker" | null };
    if (args.target && !fail) current = args.target === "speaker" ? "speakers" : "headphones";
    return { OperationSucceeded: !fail, ConsoleOutputId: current, Error: fail ? "Output restored" : "",
      Devices: [{ Id: "speakers", Name: "Speakers", Flow: 0 }, { Id: "headphones", Name: "Headphones", Flow: 0 }] };
  }
  if (command === "device_battery_read") {
    const { progress } = payload as { progress: Channel<unknown> };
    progress.onmessage({ devices: [mouse], errors: [] });
    await new Promise<void>((resolve) => { releaseBattery = resolve; });
    return { devices: [mouse, headset], errors: [] };
  }
  throw new Error(`Unexpected command ${command}`);
}, { shouldMockEvents: true });

const fixture = document.getElementById("fixture")!;
const app = createRoot(fixture);
const messages: string[] = [];
const check = (condition: unknown, label: string) => {
  if (!condition) throw new Error(label);
  messages.push(`PASS ${label}`);
};
const render = (page: "devices" | "settings" | "none") => act(async () => {
  app.render(<StrictMode><I18nProvider>{page === "devices" ? <DeviceDashboard onOpenSettings={() => { openSettings += 1; }} />
    : page === "settings" ? <DeviceBatterySettings /> : null}</I18nProvider></StrictMode>);
});
const output = (index: number) => fixture.querySelectorAll<HTMLButtonElement>(".device-dashboard__outputs button")[index];
const click = (button: HTMLButtonElement) => act(async () => { button.click(); });

try {
  saveDeviceBatterySettings({ speakerId: "speakers", headsetId: "headphones" });
  await render("none");
  check(calls.length === 0, "An inactive Devices page sends no hardware requests");
  await render("devices");
  check(fixture.textContent?.includes("≈72") && fixture.textContent?.includes(t.cached), "Partial cached reading appears while the rest is pending");
  check(calls.filter((call) => call === "device_battery_read").length === 1, "Strict Mode shares the initial scan");
  await act(async () => { releaseBattery?.(); });
  check(fixture.textContent?.includes(t.unknown) && fixture.scrollWidth <= fixture.clientWidth, "Unknown readings and long names fit the narrow island");
  check(output(0).getAttribute("aria-pressed") === "true" && !output(1).disabled, "Both bound outputs appear with the actual selected device");
  await click(output(1));
  check(output(1).getAttribute("aria-pressed") === "true", "Switch displays verified readback");
  fail = true;
  await click(output(0));
  check(output(1).getAttribute("aria-pressed") === "true" && fixture.querySelector("[role=alert]")?.textContent?.includes("restored"), "Failed switch preserves the actual output");
  const settingsLink = [...fixture.querySelectorAll("button")].find((button) => button.textContent === t.deviceSettings)!;
  await click(settingsLink);
  check(openSettings === 1, "Dashboard opens the Devices settings page");
  fail = false;
  await render("settings");
  await act(async () => { releaseBattery?.(); });
  check(fixture.textContent?.includes(t.speaker) && fixture.textContent?.includes(t.headset) && fixture.textContent?.includes(t.batteries),
    "Device settings shows both translated bindings and the readings");
  await render("none");
  document.documentElement.dataset.testResult = "passed";
} catch (error) {
  messages.push(`FAIL ${String(error)}`);
  document.documentElement.dataset.testResult = "failed";
}
document.getElementById("results")!.textContent = messages.join("\n");
