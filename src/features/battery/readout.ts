import type { BatteryText } from "../../i18n/sections/battery";
import type { BatterySummary } from "./display";
import type { BatteryDisplayMode } from "./preferences";

type RuntimeText = Pick<BatteryText, "remaining" | "untilFull" | "duration">;

/** "2:10": as wide as "100%", so the collapsed slot keeps its width whichever reading it shows. */
function compactRuntime(minutes: number) {
  const shown = Math.min(minutes, 99 * 60 + 59);
  return `${Math.floor(shown / 60)}:${String(shown % 60).padStart(2, "0")}`;
}

/** "About 2 hr 10 min left" or "About 45 min until full"; null while there is no estimate. */
export function describeBatteryRuntime({ flow, minutes }: Pick<BatterySummary, "flow" | "minutes">, text: RuntimeText) {
  if (flow === null || minutes === null) return null;
  const duration = text.duration(Math.floor(minutes / 60), minutes % 60);
  return flow === "charging" ? text.untilFull(duration) : text.remaining(duration);
}

export function formatBatteryReadout(
  summary: BatterySummary,
  displayMode: BatteryDisplayMode,
  locale: string,
  text: RuntimeText & Pick<BatteryText, "state" | "fullCharge" | "buttonLabel">,
) {
  const { percent, minutes, flow } = summary;
  const formattedPercent = percent === null ? null : new Intl.NumberFormat(locale, { style: "percent" }).format(percent / 100);
  const charge = percent === 100 ? text.fullCharge : formattedPercent;
  const showRuntime = displayMode === "remaining" && flow !== null && minutes !== null;
  return {
    value: showRuntime ? compactRuntime(minutes) : charge ?? "—",
    label: text.buttonLabel(summary.state === "full" ? null : charge, text.state[summary.state]),
    runtime: describeBatteryRuntime(summary, text),
  };
}
