import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { EyeCareIslandPanel } from "../../src/features/eye-care/EyeCareIslandPanel";
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
  headline: language === "en" ? "Resting" : "休息中", note: "", attention: true, actions: ["snooze_10", "skip"], islandActions: [],
  rows: [{ id: "timer", title: language === "en" ? "Break time remaining" : "剩余休息时长", detail: "", percent: 85, countdownTo: deadline, tone: "warning" }],
};
const manifest = {
  id: "eye-care", name: { "zh-CN": "护眼提醒", en: "Eye Care" },
  description: { "zh-CN": "护眼", en: "Eye Care" }, version: "1.0.0", apiVersion: 1,
  runtime: { command: "eye-care.exe" }, contributes: ["panel"], permissions: ["panel", "desktop-windows"],
  settings: [], panel: { icon: "heart-pulse" },
  actions: ["reset_work", "rest_now", "snooze_10", "skip"].map((id) => ({ id, label: { "zh-CN": id, en: id } })),
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
const windowActions: string[] = [];
const messages: string[] = [];
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  messages.push(`PASS ${label}`);
}
const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const islandClock = () => island.querySelector(".eye-care-island__value--countdown")?.textContent ?? "";
const restClock = () => rest.querySelector("[role=timer]")?.textContent ?? "";
const seconds = (value: string) => value.split(":").reduce((sum, part) => sum * 60 + Number(part), 0);
const showRest = () => act(async () => restRoot.render(<I18nProvider><EyeCareRestPanel
  snapshot={{ deadline, canSnooze: true, canSkip: true, percent: 60, language }} busy={false} failed={false} onAction={(action) => windowActions.push(action)}
/></I18nProvider>));
try {
  await act(async () => { await refreshPlugins(); });
  await act(async () => islandRoot.render(<I18nProvider><EyeCareIslandPanel /></I18nProvider>));
  check(island.querySelector(".eye-care-island__headline")?.textContent === panel.headline && island.querySelector(".eye-care-island__label")?.textContent === panel.rows[0].title,
    "The island shows the resting phase and remaining break time label");
  check(!island.querySelector(".eye-care-island__note") && !island.querySelector(".eye-care-island__detail"),
    "Empty notes do not fall back to the manifest description or leave redundant instructions");
  check(island.querySelector<HTMLElement>(".eye-care-island__meter span")?.style.width === "85%",
    "The island drains a bar for how much of the phase is left");
  check(island.querySelector(".eye-care-island__line--stack") !== null, "The countdown sits above its own label");
  await wait(650);
  await showRest();
  check(seconds(islandClock()) === seconds(restClock()), "Staggered mounts share the same countdown second");
  check(islandClock() === restClock(), "Eye Care uses the same clock format on both surfaces");

  deadline = Date.now() + 300_000;
  panel = { ...panel, rows: [{ ...panel.rows[0], countdownTo: deadline }] };
  await act(async () => { await refreshPlugins(); });
  await showRest();
  check(islandClock() === restClock() && seconds(restClock()) === 300, "A new deadline updates both clocks immediately");
  check(!island.querySelector(".eye-care-island__actions"), "Resting island shows no duplicate postponement or skip buttons");
  check(rest.querySelectorAll(".eye-care-rest__choices button").length === 6 && rest.querySelector(".eye-care-rest__actions button"),
    "The break window retains all six postponements and optional skipping");
  check(rest.querySelector<HTMLElement>(".eye-care-rest__meter span")?.style.width === "60%",
    "The break window drains the same kind of bar as the island");
  await act(async () => rest.querySelectorAll<HTMLButtonElement>(".eye-care-rest__choices button")[5].click());
  await act(async () => rest.querySelector<HTMLButtonElement>(".eye-care-rest__actions button")!.click());
  check(windowActions.join(",") === "snooze_30,skip", "The remaining break-window actions still work");

  jump += 10_500;
  await act(async () => window.dispatchEvent(new Event("focus")));
  check(islandClock() === restClock() && seconds(restClock()) === Math.max(0, Math.ceil((deadline - Date.now()) / 1000)),
    "Focus immediately corrects a countdown after background throttling");
  jump += 400_000;
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  check(islandClock() === "00:00" && restClock() === "00:00", "Expired clocks stop at zero after visibility resumes");
  panel = { ...panel, headline: language === "en" ? "Screen time" : "用眼中", attention: false, actions: ["reset_work", "rest_now"], islandActions: ["reset_work", "rest_now"],
    rows: [{ ...panel.rows[0], title: language === "en" ? "Screen time remaining" : "剩余用眼时长", countdownTo: Date.now() + 1_200_000 }] };
  await act(async () => { await refreshPlugins(); restRoot.render(null); });
  const workingActions = [...island.querySelectorAll<HTMLButtonElement>(".eye-care-island__action")];
  check(workingActions.map((button) => button.textContent).join(",") === "reset_work,rest_now"
    && workingActions[1].classList.contains("eye-care-island__action--primary"),
    "The working island offers Reset screen time to the left of the filled Take a break now");
  check(island.querySelector(".eye-care-island__headline")?.textContent === panel.headline && island.querySelector(".eye-care-island__label")?.textContent === panel.rows[0].title,
    "The island shows the working phase and remaining screen time label");
  const card = island.querySelector(".eye-care-island__card");
  check(card !== null && card.contains(island.querySelector(".eye-care-island__headline")!)
    && card.contains(island.querySelector(".eye-care-island__value--countdown")!)
    && card.contains(island.querySelector(".eye-care-island__action")!),
    "The phase, the remaining time and Take a break now share one card");
  panel = { ...panel, note: language === "en" ? "Already postponed once; the next break cannot be postponed" : "已经推迟过一次，不能推迟下次休息" };
  await act(async () => { await refreshPlugins(); });
  check(island.querySelector(".eye-care-island__note")?.textContent === panel.note && island.querySelector(".eye-care-island__headline")?.textContent === panel.headline,
    "Postponement adds its warning while keeping the working headline");
  panel = { ...panel, rows: [{ ...panel.rows[0], countdownTo: null, percent: null, detail: "20:00" }] };
  await act(async () => { await refreshPlugins(); });
  check(!islandClock() && island.querySelector(".eye-care-island__detail")?.textContent === "20:00" && island.querySelector(".eye-care-island__note")?.textContent === panel.note
    && !island.querySelector(".eye-care-island__meter"),
    "A paused timer retains its frozen remaining time and postponement warning");

  await act(async () => { islandRoot.unmount(); restRoot.unmount(); });
  document.getElementById("results")!.textContent = [...messages, "ALL PASS"].join("\n");
  document.documentElement.dataset.testResult = "passed";
} catch (error) {
  document.getElementById("results")!.textContent = [...messages, `FAIL ${String(error)}`].join("\n");
  document.documentElement.dataset.testResult = "failed";
} finally {
  Date.now = originalNow;
}
