import { act, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { ISLAND_FONT_PERCENT } from "../../src/features/appearance/settingsLimits";
import { BatteryReadout } from "../../src/features/battery/BatteryReadout";
import { relativeLuminance } from "../../src/utils/color";
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const readings = [
  ["—", null, "unknown"], ["0%", 0, "onBattery"], ["1%", 1, "onBattery"], ["15%", 15, "onBattery"],
  ["16%", 16, "onBattery"], ["50%", 50, "onBattery"], ["89%", 89, "onBattery"], ["99%", 99, "onBattery"],
  ["99%", 99, "charging"], ["0:05", 1, "charging"], ["99:59", 50, "charging"],
  ["2:10", 71, "pluggedDischarging"], ["71%", 71, "plugged"], ["71%", 71, "idle"],
  ["满电", 100, "full"], ["Full", 100, "full"],
] as const;
const backdrops = ["#000", "#fff", "linear-gradient(90deg, #000, #fff)"];
const tones = ["dark", "light"] as const;
const { min, max, default: normal } = ISLAND_FONT_PERCENT;
const results = document.getElementById("results")!;

function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

function colorLuminance(color: string, backdrop: number) {
  const parts = color.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  check((parts.length === 3 || parts.length === 4) && /^rgba?\(/.test(color), `Unexpected computed color: ${color}`);
  const alpha = parts[3] ?? 1;
  const hex = parts.slice(0, 3).map((channel) => Math.round(channel * alpha + backdrop * (1 - alpha)).toString(16).padStart(2, "0"));
  return relativeLuminance(`#${hex.join("")}`);
}

function contrast(first: number, second: number) {
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

async function run() {
  const forced = matchMedia("(forced-colors: active)").matches;
  check(forced === new URLSearchParams(location.search).has("forcedColors"), "Expected forced-colors setting is active");
  const root = document.getElementById("root")!;
  document.documentElement.dataset.theme = "light";
  await act(async () => createRoot(root).render(tones.flatMap((tone) => backdrops.map((background) =>
    <section key={`${tone}-${background}`} data-tone={tone} style={{ background, color: "#cfb124", padding: 8 }}>
      {[min, normal, max].map((fontPercent) =>
        <div key={fontPercent} style={{ "--island-font-scale": fontPercent / 100, display: "flex", gap: 8, padding: 4 } as CSSProperties}>
          {readings.map(([value, percent, state]) =>
            <BatteryReadout key={`${value}-${state}`} readoutStyle="badge" value={value}
              level={{ percent, state, low: state === "onBattery" && percent <= 15 }} />,
          )}
        </div>,
      )}
    </section>,
  ))));
  await document.fonts.ready;

  let worstText = Infinity;
  const worstNeutralBoundary = { dark: Infinity, light: Infinity };
  const colors = { dark: new Set<string>(), light: new Set<string>() };
  const samples = [...root.querySelectorAll<HTMLElement>(".battery-readout")];
  for (const [index, sample] of samples.entries()) {
    const body = sample.querySelector<HTMLElement>(".battery-readout__body")!;
    const fill = sample.querySelector<HTMLElement>(".battery-readout__fill")!;
    const values = sample.querySelectorAll<HTMLElement>(".battery-readout__value");
    const value = values[0];
    const label = `${value.textContent}, ${getComputedStyle(value).fontSize}`;
    check(values.length === 1 && getComputedStyle(value).clipPath === "none", `${label}: reading must not be split`);
    check(value.textContent === readings[index % readings.length][0].replace(/%$/, ""), `${label}: only percent readings drop the suffix`);
    const range = document.createRange();
    range.selectNodeContents(value);
    const ink = range.getBoundingClientRect();
    const box = body.getBoundingClientRect();
    check(ink.left >= box.left + 1.5 && ink.right <= box.right - 1.5 && ink.top >= box.top - 0.5 && ink.bottom <= box.bottom + 0.5,
      `${label}: text or bolt is clipped (${ink.width} × ${ink.height} in ${box.width} × ${box.height})`);
    const percent = parseFloat(sample.style.getPropertyValue("--battery-fill"));
    check(Math.abs(fill.getBoundingClientRect().width - (box.width - 2) * percent / 100) < 0.1, `${label}: incorrect fill width`);

    const foreground = getComputedStyle(value).color;
    const surface = getComputedStyle(body).backgroundColor;
    const charge = getComputedStyle(fill).backgroundColor;
    const tone = sample.closest<HTMLElement>("[data-tone]")?.dataset.tone === "light" ? "light" : "dark";
    const low = sample.hasAttribute("data-low");
    const charging = sample.hasAttribute("data-charging");
    colors[tone].add(charge);
    for (const extreme of [0, 255]) {
      const text = colorLuminance(foreground, extreme);
      const empty = colorLuminance(surface, extreme);
      const filled = colorLuminance(charge, extreme);
      worstText = Math.min(worstText, contrast(text, empty), ...(forced ? [] : [contrast(text, filled)]));
    }
    if (forced) {
      const stripe = fill.getBoundingClientRect();
      check(charge === foreground && stripe.height === 2 && ink.bottom <= stripe.top + 1, `${label}: system-color fill must sit below the reading`);
    } else {
      check(foreground === (tone === "light" ? "rgb(255, 255, 255)" : "rgb(16, 18, 22)")
        && /^rgba\(/.test(surface) && /^rgb\(/.test(charge), `${label}: fixed theme ink, translucent track and solid charge`);
      if (percent === 0 && low) {
        check(getComputedStyle(body).borderTopColor === charge, "At 0%, the red outline still indicates low charge");
      }
      if (tone === "light" && (low || charging)) {
        check(surface === "rgba(0, 0, 0, 0.86)", `${label}: warning and charging retain their darker track`);
      }
      if (!low && !charging) {
        check(charge === (tone === "dark" ? "rgb(204, 204, 204)" : "rgb(0, 0, 0)"), `${label}: ordinary fill is neutral gray or black`);
        const backdrop = tone === "dark" ? 47 : 244;
        const empty = colorLuminance(surface, backdrop);
        const filled = colorLuminance(charge, backdrop);
        check(tone === "dark" ? filled > empty : filled < empty, `${label}: the solid block follows the island tone`);
        worstNeutralBoundary[tone] = Math.min(worstNeutralBoundary[tone], contrast(filled, empty));
      }
    }
  }

  check(samples.length === readings.length * backdrops.length * tones.length * 3, "Every tone, backdrop and font size covers all readings");
  check(tones.every((tone) => colors[tone].size === (forced ? 1 : 3)), "Each tone distinguishes normal, low and charging fills");
  check(worstText >= 4.5, `Insufficient text contrast: ${worstText.toFixed(2)}:1`);
  check(forced || (worstNeutralBoundary.dark >= 1.9 && worstNeutralBoundary.light >= 3), "The neutral fill and track are distinguishable on the standard island");
  results.textContent = `PASS ${samples.length} readings fit without clipping (${forced ? "forced colors" : "adaptive ink"})\n`
    + `PASS Minimum text contrast ${worstText.toFixed(2)}:1 against both track and solid fill`;
  results.dataset.result = "passed";
}

void run().catch((error: unknown) => {
  results.textContent = `FAIL ${String(error)}`;
  results.dataset.result = "failed";
});
