import { useLocale, useTranslation } from "../../i18n";
import { BatteryReadout } from "./BatteryReadout";
import { summarizeBattery } from "./display";
import type { BatteryPowerEstimate } from "./powerEstimate";
import type { BatteryDisplayMode, BatteryReadoutStyle } from "./preferences";
import { formatBatteryReadout } from "./readout";
import type { BatterySnapshot } from "./snapshot";
import "./BatteryStatusButton.css";

type BatteryStatusButtonProps = {
  snapshot: BatterySnapshot;
  estimate?: BatteryPowerEstimate | null;
  displayMode: BatteryDisplayMode;
  readoutStyle: BatteryReadoutStyle;
  onOpen: () => void;
};

/** The collapsed island's battery slot; the tooltip carries the state and the time left. */
export function BatteryStatusButton({ snapshot, estimate, displayMode, readoutStyle, onOpen }: BatteryStatusButtonProps) {
  const t = useTranslation().battery;
  const { locale } = useLocale();
  const summary = summarizeBattery(snapshot, estimate);
  const { value, label, runtime } = formatBatteryReadout(summary, displayMode, locale, t);

  return (
    <button
      type="button"
      className="battery-status"
      aria-label={label}
      aria-description={runtime ?? undefined}
      title={runtime ? `${label}\n${runtime}` : label}
      onClick={onOpen}
    >
      <BatteryReadout level={summary} value={value} readoutStyle={readoutStyle} />
    </button>
  );
}
