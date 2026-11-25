import type { CSSProperties } from "react";
import { Zap } from "lucide-react";
import type { BatterySummary } from "./display";
import type { BatteryReadoutStyle } from "./preferences";
import "./BatteryReadout.css";

type ReadoutLevel = Pick<BatterySummary, "percent" | "state" | "low">;

export function BatteryReadout({ level, value, readoutStyle }: {
  level: ReadoutLevel;
  value: string;
  readoutStyle: BatteryReadoutStyle;
}) {
  const { percent, state, low } = level;
  const charging = state === "charging";
  const compact = readoutStyle === "badge" && charging && value.length > 4;
  const reading = <>
    {charging && <Zap className="battery-readout__bolt" size={9} fill="currentColor" strokeWidth={1.5} absoluteStrokeWidth />}
    {value}
  </>;

  return (
    <span
      className="battery-readout"
      data-style={readoutStyle}
      data-low={low || undefined}
      data-charging={charging || undefined}
      style={{ "--battery-fill": `${percent ?? 0}%` } as CSSProperties}
      aria-hidden="true"
    >
      <span className="battery-readout__body">
        <span className="battery-readout__fill" />
        <span className="battery-readout__value" data-compact={compact || undefined}>{reading}</span>
        {readoutStyle === "inverted" && <span className="battery-readout__value battery-readout__value--on-fill">{reading}</span>}
      </span>
      <span className="battery-readout__cap" />
    </span>
  );
}
