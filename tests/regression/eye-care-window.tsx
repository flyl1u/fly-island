import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { emit } from "@tauri-apps/api/event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { EyeCareWindow } from "../../src/windows/eye-care/EyeCareWindow";
import { EYE_CARE_EVENT } from "../../src/windows/eye-care/api";
import { I18nProvider, LOCALE_STORAGE_KEY, TRANSLATIONS } from "../../src/i18n";
import { STORAGE_KEY } from "../../src/features/appearance/storage";
import type { EyeCareBreak } from "../../src/features/eye-care/types";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const query = new URLSearchParams(location.search);
const language = query.get("lang") === "en" ? "en" : "zh-CN";
const hostLanguage = language === "en" ? "zh-CN" : "en";
const theme = query.get("theme") === "light" ? "light" : "dark";
const material = query.get("material") ?? "classic";
const text = TRANSLATIONS[language].eyeCare;
localStorage.setItem(LOCALE_STORAGE_KEY, hostLanguage);
localStorage.setItem(STORAGE_KEY, JSON.stringify({ colorScheme: theme, material }));
const snapshot: EyeCareBreak = { deadline: Date.now() + 90_000, canSnooze: true, canSkip: true, percent: 72, language };
const actions: { id: string; action: string }[] = [];
let revealed = 0;
let failAction = false;
let delayInitial = false;
let resolveInitial: ((value: EyeCareBreak) => void) | undefined;
mockIPC((command, payload) => {
  if (command === "get_eye_care_break") return delayInitial
    ? new Promise<EyeCareBreak>((resolve) => { resolveInitial = resolve; }) : snapshot;
  if (command === "show_eye_care_break_window") { revealed += 1; return null; }
  if (command === "run_plugin_action") {
    actions.push(payload as { id: string; action: string });
    if (failAction) throw new Error("mock failure");
    return { success: true };
  }
  return null;
}, { shouldMockEvents: true });

const fixture = document.getElementById("fixture")!;
const results = document.getElementById("results")!;
let root = createRoot(fixture);
const checks: string[] = [];
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  checks.push(`PASS ${label}`);
}
const wait = (ms = 100) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const mount = () => act(async () => root.render(<StrictMode><I18nProvider><EyeCareWindow /></I18nProvider></StrictMode>));
const update = (value: EyeCareBreak | null) => act(async () => { await emit(EYE_CARE_EVENT, value); });
const clock = () => document.querySelector("[role=timer]")?.textContent ?? "";
const seconds = (value: string) => value.split(":").reduce((sum, part) => sum * 60 + Number(part), 0);

try {
  await mount(); await wait(160);
  check(document.querySelector("h1")?.textContent === text.title, "The break uses its configured language");
  check(!document.querySelector(".eye-care-rest__name") && !document.querySelector(".eye-care-rest__hint"),
    "The break window has no plugin badge or looking-away hint");
  const card = document.querySelector<HTMLElement>(".eye-care-rest__card")!;
  check(card.contains(document.querySelector(".eye-care-rest__title")!)
    && card.contains(document.querySelector("[role=timer]")!)
    && card.contains(document.querySelector(".eye-care-rest__label")!)
    && card.contains(document.querySelector(".eye-care-rest__meter")!)
    && card.contains(document.querySelector(".eye-care-rest__choices")!),
    "Title, countdown, its label, the bar and the choices share one card");
  check(document.querySelector(".eye-care-rest__label")?.textContent === text.remaining,
    "The countdown carries its own label under the digits");
  check(document.querySelector<HTMLElement>(".eye-care-rest__meter span")?.style.width === "72%",
    "The bar drains by the share the plugin reports");
  check(localStorage.getItem(LOCALE_STORAGE_KEY) === hostLanguage, "Break language does not overwrite the host preference");
  check(document.documentElement.dataset.theme === theme && document.documentElement.dataset.material === material,
    "The window follows the host scheme and material");
  check(revealed > 0, "The host is asked to reveal only after state and first paint");
  const pills = [...document.querySelectorAll<HTMLElement>(".eye-care-rest__choices .settings-link-button")];
  check(pills.length === 6, "All six postponements reuse host controls");
  check(pills.map((pill) => pill.textContent).join(",") === [5, 10, 15, 20, 25, 30].map(text.minutes).join(","),
    "Postponements run from five to thirty minutes in order");
  check(document.querySelector(".settings-link-button--danger")?.textContent === text.skip,
    "Skipping has the localized host action style");
  const before = clock();
  await wait(1200);
  check(seconds(clock()) < seconds(before), "The displayed countdown advances locally");
  await act(async () => document.querySelectorAll<HTMLButtonElement>(".eye-care-rest__choices button")[0].click());
  check(actions[actions.length - 1]?.id === "eye-care" && actions[actions.length - 1]?.action === "snooze_5", "Postponement routes to the plugin's 5-minute action");
  failAction = true;
  await act(async () => document.querySelector<HTMLButtonElement>(".settings-link-button--danger")!.click());
  check(document.querySelector("[role=alert]")?.textContent === text.failed, "Failed actions offer localized guidance without raw errors");
  failAction = false;
  await update({ ...snapshot, canSnooze: false, canSkip: false });
  check(!document.querySelector(".eye-care-rest__choices") && !document.querySelector(".eye-care-rest__actions"),
    "A used postponement and forbidden skip have no controls");
  fixture.style.width = "260px";
  fixture.style.height = "220px";
  await update(snapshot); await wait();
  const windowElement = document.querySelector<HTMLElement>(".eye-care-window")!;
  check(windowElement.scrollWidth <= windowElement.clientWidth + 1, "Narrow break windows have no horizontal overflow");
  check(windowElement.scrollHeight > windowElement.clientHeight, "Short screens scroll instead of clipping the controls");

  await act(async () => root.unmount());
  root = createRoot(fixture);
  delayInitial = true;
  await mount(); await wait();
  check(resolveInitial, "The initial state read is pending for the race check");
  await update({ ...snapshot, canSnooze: false, canSkip: false });
  await act(async () => { resolveInitial?.(snapshot); });
  check(!document.querySelector(".eye-care-rest__choices"), "A late initial read cannot restore stale actions");
  await update(null);
  check(!document.querySelector(".eye-care-rest"), "End-of-break state removes every old action");
  await act(async () => root.unmount());
  results.textContent = [...checks, "ALL PASS"].join("\n");
  document.documentElement.dataset.testResult = "passed";
} catch (error) {
  results.textContent = [...checks, `FAIL ${String(error)}`].join("\n");
  document.documentElement.dataset.testResult = "failed";
}
