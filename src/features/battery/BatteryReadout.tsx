import type { CSSProperties } from "react";
import { Zap } from "lucide-react";
import type { BatterySummary } from "./display";
import "./BatteryReadout.css";

type ReadoutLevel = Pick<BatterySummary, "percent" | "state" | "low">;

/**
 * The battery with its reading inside. The reading is drawn twice, once in the text colour and once
 * in the colour that reads on the charge; the second copy is cut off where the charge ends, so the
 * digits invert exactly at the fill's edge.
 */
export function BatteryReadout({ level, value }: { level: ReadoutLevel; value: string }) {
  const { percent, state, low } = level;
  const charging = state === "charging";
  const reading = <>
    {charging && <Zap className="battery-readout__bolt" size={9} fill="currentColor" strokeWidth={1.5} absoluteStrokeWidth />}
    {value}
  </>;

  return (
    <span
      className="battery-readout"
      data-low={low || undefined}
      data-charging={charging || undefined}
      style={{ "--battery-fill": `${percent ?? 0}%` } as CSSProperties}
      aria-hidden="true"
    >
      <span className="battery-readout__body">
        <span className="battery-readout__fill" />
        <span className="battery-readout__value">{reading}</span>
        <span className="battery-readout__value battery-readout__value--on-fill">{reading}</span>
      </span>
      <span className="battery-readout__cap" />
    </span>
  );
}
