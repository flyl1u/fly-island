import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { PluginPanel } from "../../src/features/plugins/PluginPanel";
import { refreshPlugins } from "../../src/features/plugins/usePlugins";
import { EyeCareRestPanel } from "../../src/features/eye-care/EyeCareRestPanel";
import type { PluginPanel as Panel } from "../../src/features/plugins/api";
import { I18nProvider, LOCALE_STORAGE_KEY } from "../../src/i18n";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const language = new URLSearchParams(location.search).get("lang") === "en" ? "en" : "zh-CN";
localStorage.setItem(LOCALE_STORAGE_KEY, language);
const originalNow = Date.now;
const base = Math.floor(originalNow() / 1000) * 1000;
const started = performance.now();
let jump = 0;
Date.now = () => base + Math.floor(performance.now() - started) + jump;
let deadline = base + 90_400;
let panel: Panel = {
  headline: "Eye Care", note: null, attention: true, actions: ["snooze_10", "skip"],
  rows: [{ id: "timer", title: "Break ends", detail: null, percent: null, countdownTo: deadline, tone: "warning" }],
};
const manifest = {
  id: "eye-care", name: { "zh-CN": "护眼提醒", en: "Eye Care" },
  description: { "zh-CN": "护眼", en: "Eye Care" }, version: "0.2.0", apiVersion: 1,
  runtime: { command: "eye-care.exe" }, contributes: ["panel"], permissions: ["panel", "desktop-windows"],
  settings: [], panel: { icon: "heart-pulse" },
  actions: ["rest_now", "snooze_10", "skip"].map((id) => ({ id, label: { "zh-CN": id, en: id } })),
};
mockIPC((command) => {
  if (command === "get_plugins") return {
    registry: { developerMode: true, indexUrl: "", installed: {
      "eye-care": { manifest, enabled: true, directory: "", development: true, settings: {} },
    } },
    live: { "eye-care": { status: "running", quota: [], sessions: [], notifications: [], panel } },
  };
  if (command === "plugin:event|listen") return 1;
  return null;
}, { shouldMockEvents: true });
const island = document.getElementById("island")!;
const rest = document.getElementById("rest")!;
const islandRoot = createRoot(island);
const restRoot = createRoot(rest);
const messages: string[] = [];
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  messages.push(`PASS ${label}`);
}
const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const islandClock = () => island.querySelector(".plugin-panel__value--countdown")?.textContent ?? "";
const restClock = () => rest.querySelector("[role=timer]")?.textContent ?? "";
const seconds = (value: string) => value.split(":").reduce((sum, part) => sum * 60 + Number(part), 0);
const showRest = () => act(async () => restRoot.render(<I18nProvider><EyeCareRestPanel
  snapshot={{ deadline, canSnooze: true, canSkip: true, language }} busy={false} failed={false} onAction={() => {}}
/></I18nProvider>));
try {
  await act(async () => { await refreshPlugins(); });
  await act(async () => islandRoot.render(<I18nProvider><PluginPanel pluginId="eye-care" /></I18nProvider>));
  await wait(650);
  await showRest();
  check(seconds(islandClock()) === seconds(restClock()), "Staggered mounts share the same countdown second");
  check(islandClock() === restClock(), "Eye Care uses the same clock format on both surfaces");

  deadline = Date.now() + 300_000;
  panel = { ...panel, rows: [{ ...panel.rows[0], countdownTo: deadline }] };
  await act(async () => { await refreshPlugins(); });
  await showRest();
  check(islandClock() === restClock() && seconds(restClock()) === 300, "A new deadline updates both clocks immediately");

  jump += 10_500;
  await act(async () => window.dispatchEvent(new Event("focus")));
  check(islandClock() === restClock() && seconds(restClock()) === Math.max(0, Math.ceil((deadline - Date.now()) / 1000)),
    "Focus immediately corrects a countdown after background throttling");
  jump += 400_000;
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  check(islandClock() === "00:00" && restClock() === "00:00", "Expired clocks stop at zero after visibility resumes");

  await act(async () => { islandRoot.unmount(); restRoot.unmount(); });
  document.getElementById("results")!.textContent = [...messages, "ALL PASS"].join("\n");
  document.documentElement.dataset.testResult = "passed";
} catch (error) {
  document.getElementById("results")!.textContent = [...messages, `FAIL ${String(error)}`].join("\n");
  document.documentElement.dataset.testResult = "failed";
} finally {
  Date.now = originalNow;
}
