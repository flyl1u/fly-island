import { act } from "react";
import type { BatterySnapshot } from "../../src/features/battery/snapshot";
import { NATIVE_PLUGINS_KEY, setNativePluginInstalled } from "../../src/features/plugins/native";
import { TRANSLATIONS } from "../../src/i18n";

/** ?battery=<fixture> installs the Battery plugin for the tour; &batteryDisplay=remaining shows the time left. */
export function prepareBatteryTour(query: URLSearchParams) {
  if (!query.has("battery")) return {};
  const installed: unknown = JSON.parse(localStorage.getItem(NATIVE_PLUGINS_KEY) ?? "[]");
  localStorage.setItem(NATIVE_PLUGINS_KEY, JSON.stringify([...(Array.isArray(installed) ? installed : []), "battery"]));
  return { batteryDisplayMode: query.get("batteryDisplay"), batteryReadoutStyle: query.get("batteryStyle") };
}

const FULL_MWH = 50_400;
const INITIAL_ENERGY_MWH = 35_800;
let remainingMwh = INITIAL_ENERGY_MWH;

export function tourBattery(includeDetails: boolean, fixture: string | null): BatterySnapshot | null {
  if (fixture === "absent") return null;
  const full = fixture === "full";
  const low = fixture === "low";
  const charging = fixture === "charging" || fixture === "drainingOnAc" || full;
  const pluggedIn = charging || fixture === "limited";
  return {
    percent: full ? 100 : low ? 12 : 71,
    pluggedIn,
    charging,
    secondsRemaining: pluggedIn ? null : low ? 1380 : 7800,
    details: includeDetails && fixture !== "limited"
      ? { remainingMwh: full ? FULL_MWH : remainingMwh - (low ? 29_750 : 0), fullMwh: FULL_MWH, designMwh: 56_000, rateMw: charging ? 12_400 : -16_500 }
      : null,
  };
}

export async function runBatteryTour(
  query: URLSearchParams,
  mount: () => void,
  click: (selector: string) => Promise<void>,
  results: HTMLElement,
  restore: () => void,
) {
  const messages: string[] = [];
  const dateNow = Date.now;
  const performanceNow = performance.now.bind(performance);
  const originalPerformanceNow = performance.now;
  const check = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
    messages.push("PASS " + message);
  };
  const settle = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
  /** Three more readings, four seconds apart for the power estimate and half a minute apart for the chart. */
  const sample = async (energyChange: number) => {
    let offset = 0;
    Date.now = () => dateNow() + offset * 31_000;
    performance.now = () => performanceNow() + offset * 4_000;
    for (let index = 0; index < 3; index++) {
      remainingMwh += energyChange;
      offset++;
      await act(async () => window.dispatchEvent(new Event("focus")));
    }
  };
  try {
    await act(async () => mount());
    await settle(500);
    const text = TRANSLATIONS[query.get("lang") === "en" ? "en" : "zh-CN"];
    const t = text.battery;
    const market = text.settings.plugins.market;
    const fixture = query.get("battery");
    const island = () => document.querySelector<HTMLElement>(".island")!;
    const slot = () => document.querySelector<HTMLButtonElement>(".battery-status");
    const readout = () => slot()!.querySelector<HTMLElement>(".battery-readout")!;
    const body = () => readout().querySelector<HTMLElement>(".battery-readout__body")!;
    const layers = () => [...readout().querySelectorAll<HTMLElement>(".battery-readout__value")];
    const shown = () => layers()[0].textContent ?? "";
    const textWidth = () => document.querySelector<HTMLElement>(".island__text-slot")!.offsetWidth;
    const nav = () => document.querySelector<HTMLElement>(".dot-button--battery");
    const saved = () => JSON.parse(localStorage.getItem("fly-island-settings") ?? "{}") as Record<string, unknown>;
    if (fixture === "absent") {
      check(!slot() && !nav(), "Installed on a computer without a battery, there is no slot and no page");
      results.textContent = messages.join("\n");
      results.dataset.result = "passed";
      return;
    }

    const full = fixture === "full";
    const low = fixture === "low";
    const charging = fixture === "charging";
    const draining = fixture === "drainingOnAc";
    const sampled = charging || draining || query.has("batterySamples");
    const wantsTime = query.get("batteryDisplay") === "remaining";
    const badge = query.get("batteryStyle") === "badge";
    const percentValue = full ? t.fullCharge : low ? "12%" : "71%";
    const systemTime = fixture === "normal" ? "2:10" : low ? "0:23" : null;
    const isTime = (value: string) => /^\d+:\d\d$/.test(value);
    const button = slot()!;

    check(button.getAttribute("aria-label")?.startsWith(t.buttonLabel(full ? null : percentValue, "").slice(0, -1))
      && shown() === (wantsTime ? systemTime ?? (charging || draining ? "1:11" : percentValue) : percentValue),
    "The collapsed slot shows the chosen reading: Windows' estimate on battery, the driver's rate while charging, else the charge");
    const fill = readout().querySelector<HTMLElement>(".battery-readout__fill")!;
    const percent = full ? 100 : low ? 12 : 71;
    check(getComputedStyle(body()).borderTopLeftRadius !== "0px"
      && layers().every((layer) => layer.scrollWidth <= body().clientWidth)
      && Math.abs(fill.getBoundingClientRect().width / body().clientWidth - percent / 100) < 0.03,
    "The reading fits inside the rounded battery and the fill matches the charge");
    if (badge) {
      check(layers().length === 1 && readout().dataset.style === "badge" && getComputedStyle(layers()[0]).color === "rgb(255, 255, 255)",
        "The saved badge style uses one white reading over the entire battery");
    } else {
      const clipped = layers()[1];
      const clip = clipped ? getComputedStyle(clipped).clipPath : "";
      check(layers().length === 2 && clipped.textContent === shown()
        && (clip.includes(`${100 - percent}%`) || clip.includes(`${percent}%`))
        && getComputedStyle(clipped).color !== getComputedStyle(layers()[0]).color,
      "The default style is inverted exactly where the charge covers it (" + clip + ")");
    }
    check(Boolean(readout().dataset.low) === low
      && (badge || (getComputedStyle(readout()).color !== getComputedStyle(button).color) === low)
      && !readout().hasAttribute("data-runtime-flow"),
    "Only a low battery changes colour; an ordinary discharge keeps the island's text colour");

    // The island's width with the slot and without it.
    const withSlot = { island: island().getBoundingClientRect().width, text: textWidth() };
    await act(async () => setNativePluginInstalled("battery", false));
    await settle(600);
    const without = { island: island().getBoundingClientRect().width, text: textWidth() };
    await act(async () => setNativePluginInstalled("battery", true));
    await settle(600);
    check(!!slot() && withSlot.island > without.island && withSlot.text >= without.text - 4
      && slot()!.getBoundingClientRect().right <= island().getBoundingClientRect().right,
    `The island grows for the slot (${without.island} to ${withSlot.island}px) and the text keeps its room (${without.text} to ${withSlot.text}px)`);

    if (charging || draining) {
      check(readout().hasAttribute("data-charging") && layers().every((layer) => layer.querySelector("svg")),
        "Until samples arrive the slot follows the driver's charging flag, with a bolt in the reading");
    }
    if (sampled) await sample(draining || !charging ? -20 : 20);
    const title = slot()!.title;
    if (charging) {
      check(isTime(shown()) === wantsTime && title.includes(t.state.charging) && title.includes(t.untilFull("§").split("§")[1])
        && slot()!.getAttribute("aria-description") === title.split("\n")[1],
      "Charging counts down to full from the sampled rate, and says so in the tooltip");
    } else if (draining) {
      check(isTime(shown()) && !readout().hasAttribute("data-charging") && title.includes(t.state.pluggedDischarging)
        && title.includes(t.remaining("§").split("§")[0]),
      "With the charger attached, falling capacity overrides the driver's flag and counts down to empty");
    } else if (full) {
      check(!readout().hasAttribute("data-charging") && !slot()!.getAttribute("aria-description") && title === t.buttonLabel(null, t.state.full),
        "At full charge a stale charging flag shows neither a bolt nor an estimate");
    } else if (systemTime) {
      check(title === `${t.buttonLabel(percentValue, t.state.onBattery)}\n${t.remaining(t.duration(low ? 0 : 2, low ? 23 : 10))}`,
        "The tooltip carries the state and the time left whichever reading is shown");
    }

    await click(".battery-status");
    const panel = document.querySelector<HTMLElement>(".battery-panel")!;
    check(panel && nav()?.getAttribute("aria-current") === "page" && getComputedStyle(nav()!, "::before").backgroundColor !== "rgba(0, 0, 0, 0)",
      "The slot opens the Battery page, whose header entry has a colour of its own");
    const charge = panel.querySelector<HTMLElement>(".battery-panel__percent")!;
    const track = panel.querySelector<HTMLElement>(".battery-panel__track")!;
    const trackFill = panel.querySelector<HTMLElement>(".battery-panel__fill")!;
    check(charge.textContent === (full ? "100%" : percentValue) && parseFloat(getComputedStyle(charge).fontSize) >= 32
      && Math.abs(trackFill.getBoundingClientRect().width / track.getBoundingClientRect().width - percent / 100) < 0.02
      && getComputedStyle(track).borderTopLeftRadius !== "0px" && !panel.querySelector(".battery-panel__scale"),
    "The page says the charge once: a large number over one rounded bar");
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    check((getComputedStyle(trackFill).animationName !== "none") === (charging && !reducedMotion),
      "The bar animates only while charging and motion is allowed");
    const expectedState = full ? "full" : charging ? "charging" : draining ? "pluggedDischarging" : fixture === "limited" ? "idle" : "onBattery";
    const state = panel.querySelector<HTMLElement>(".battery-panel__state")!;
    check(panel.dataset.state === expectedState && state.textContent === t.state[expectedState] && Boolean(state.querySelector("svg")) === charging,
      "The status line names the power state, with a bolt only while charging");
    const fact = (key: string) => panel.querySelector<HTMLElement>(`[data-fact='${key}']`)?.textContent ?? null;
    const stat = (key: string) => panel.querySelector<HTMLElement>(`[data-stat='${key}'] dd`)?.textContent ?? null;
    if (fixture === "limited") {
      check(panel.querySelector(".battery-panel__facts")?.textContent === t.detailsUnavailable && !panel.querySelector("dl"),
        "Without capacity data the page says so in one line and draws no empty rows");
    } else {
      check(stat("health") === "90%" && stat("full") === "50.4 Wh" && stat("design") === "56.0 Wh" && /^\d+\.\d Wh$/.test(stat("current") ?? "")
        && new Set([...panel.querySelectorAll("[data-stat]")].map((item) => Math.round(item.getBoundingClientRect().top))).size === 1,
      "What the battery holds now, its full and design capacity and its health share one row");
      if (full) {
        check(fact("runtime") === null && fact("power") === null, "A full battery shows no estimate and no power reading");
      } else {
        const power = fact("power") ?? "";
        check(sampled ? /^\d+\.\d W$/.test(power) && power !== (charging || draining ? "12.4 W" : "16.5 W") : power === "16.5 W",
          `One power reading, the sampled rate once there is one (${power})`);
        check(charging ? fact("runtime")?.endsWith(t.untilFull("§").split("§")[1]) : draining ? fact("runtime")?.startsWith(t.remaining("§").split("§")[0])
          : fact("runtime") === t.remaining(t.duration(low ? 0 : 2, low ? 23 : 10)),
        "The time left matches the collapsed slot's estimate");
      }
    }
    const fitsIsland = (element: HTMLElement) => {
      const content = document.querySelector<HTMLElement>(".island__content")!.getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      return bounds.bottom <= content.bottom + 1 && bounds.right <= content.right + 1
        && getComputedStyle(element).overflowY === "visible" && element.scrollWidth <= element.clientWidth + 1;
    };
    check(fitsIsland(panel), "The page fits inside the island without a scrollbar");

    const history = panel.querySelector<HTMLElement>(".battery-history")!;
    if (!sampled) {
      check(history.querySelector(".battery-history__empty")?.textContent === t.historyEmpty && !history.querySelector("svg"),
        "With a single reading the chart says it is recording instead of drawing a dot");
    } else {
      const plot = history.querySelector<SVGSVGElement>(".battery-history__plot")!;
      const line = plot.querySelector(".battery-history__line");
      const area = line?.parentElement?.querySelector(".battery-history__area");
      const axis = [...history.querySelectorAll(".battery-history__axis span")].map((label) => label.textContent).join();
      const times = [...history.querySelectorAll<HTMLTimeElement>(".battery-history__times time")];
      check(line && area && area.getAttribute("points")?.startsWith(line.getAttribute("points") + " ")
        && getComputedStyle(area).fill === getComputedStyle(line).stroke && axis === "100%,50%,0%"
        && times.length === 2 && times[1].textContent === t.now && !history.querySelector("h3"),
      "The chart labels its guide lines and its ends, with no heading of its own");
      check(Boolean(plot.querySelector(".battery-history__point[data-charging]")) === charging, "The latest point is marked as charging only when it is");
      const chart = history.querySelector<HTMLElement>(".battery-history__inspect")!;
      const detail = () => chart.querySelector<HTMLElement>(".battery-history__detail");
      const time = () => detail()?.querySelector("time")?.dateTime;
      await act(async () => chart.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: chart.getBoundingClientRect().right - 1 })));
      const latestTime = time();
      const tip = detail()!.getBoundingClientRect(), plotBox = chart.getBoundingClientRect();
      check(tip.right > plotBox.right - 12 && tip.right <= plotBox.right + 1
        && detail()!.children.length === 3 && getComputedStyle(detail()!).whiteSpace === "nowrap",
      "The sample's details sit over the sample, inside the plot, in three rows that never wrap");
      check(latestTime === times[1].dateTime && detail()?.textContent?.includes(charging ? t.state.charging : t.historyDischarging)
        && detail()?.textContent?.includes(percentValue) && chart.querySelector(".battery-history__selected"),
      "Hover highlights the nearest sample with its time, charge and direction");
      await act(async () => chart.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
      check(time() && time() !== latestTime && chart.querySelector("[aria-live]")?.textContent?.includes(percentValue),
        "Arrow keys step through the samples and announce the reading");
      await act(async () => chart.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: plotBox.left + 1 })));
      const leftTip = detail()!.getBoundingClientRect();
      check(leftTip.left >= plotBox.left - 1 && leftTip.right <= plotBox.right + 1,
        "At the left edge the box slides right instead of leaving the plot");
      await act(async () => chart.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
      check(!detail(), "Escape closes the sample details");
    }

    await click(".island-settings-button");
    await click(".settings-sidebar__item[data-category='battery']");
    const group = () => [...document.querySelectorAll<HTMLElement>(".settings-group")]
      .find((item) => item.querySelector(".settings-group__title")?.textContent === t.name);
    check(group() && group()!.querySelectorAll(".settings-row").length === 3 && !group()!.querySelector(".settings-row--indent, [role='spinbutton'], [role='combobox']"),
      "Installed, the plugin has a settings page of its own for reading, style and history");
    const choose = async (label: string) => {
      const option = [...group()!.querySelectorAll<HTMLButtonElement>(".settings-choice__option")].find((item) => item.textContent === label)!;
      await act(async () => option.click());
      check(option.getAttribute("aria-pressed") === "true", `The setting marks ${label} as selected`);
    };
    // Power is only sampled while the collapsed island or the Battery page shows; behind the settings
    // page the slot falls back to the system's estimate, which exists on battery power only.
    const canShowTime = systemTime !== null;
    await choose(t.displayOptions.remaining);
    const slotWidth = slot()!.getBoundingClientRect().width;
    check((canShowTime ? isTime(shown()) : shown() === percentValue) && saved().batteryDisplayMode === "remaining",
      "Choosing the time left updates the island at once and is saved");
    await choose(t.readoutStyleOptions.badge);
    check(layers().length === 1 && readout().dataset.style === "badge" && saved().batteryReadoutStyle === "badge"
      && saved().batteryDisplayMode === "remaining" && slot()!.getBoundingClientRect().width === slotWidth,
    "The badge style is saved without changing the reading or the slot width");
    await choose(t.readoutStyleOptions.inverted);
    check(layers().length === 2 && saved().batteryReadoutStyle === "inverted", "The original style can be restored from settings");
    await choose(t.displayOptions.percent);
    check(shown() === percentValue && saved().batteryDisplayMode === "percent" && slot()!.getBoundingClientRect().width === slotWidth,
      "Back on charge, the slot is exactly as wide as before");
    if (query.has("batterySamples")) {
      await act(async () => group()!.querySelector<HTMLInputElement>("[role='switch']")!.click());
      check(saved().batteryHistoryEnabled === false, "Turning the chart off is saved");
      await click(".dot-button--battery");
      const compact = document.querySelector<HTMLElement>(".battery-panel");
      check(compact && !document.querySelector(".battery-history") && fitsIsland(compact), "Without the chart the page is shorter and still fits");
      await click(".island-settings-button");
    }
    await click(".settings-sidebar__item[data-category='plugins']");
    await click(`button[aria-label='${market.uninstallNamed(market.items.battery.name)}']`);
    check(!slot() && !nav() && !document.querySelector(".settings-sidebar__item[data-category='battery']"),
      "Removing the plugin from the market takes the slot, the page and its settings page away");
    results.textContent = messages.join("\n");
    results.dataset.result = "passed";
  } catch (error) {
    results.textContent = [...messages, "FAIL " + String(error)].join("\n");
    results.dataset.result = "failed";
  } finally {
    Date.now = dateNow;
    performance.now = originalPerformanceNow;
    remainingMwh = INITIAL_ENERGY_MWH;
    restore();
  }
}
