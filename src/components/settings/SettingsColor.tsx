import type { ReactNode } from "react";
import "./SettingsColor.css";

/** A colour as a settings row shows it: its hex value, then a swatch that opens the picker. */
export function SettingsColor({
  value,
  ariaLabel,
  onChange,
  valueControl,
}: {
  value: string;
  ariaLabel: string;
  onChange: (value: string) => void;
  valueControl?: ReactNode;
}) {
  return (
    <div className="settings-color">
      {valueControl ?? <span className="settings-color__value">{value.toUpperCase()}</span>}
      <input
        className="settings-color__swatch"
        type="color"
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </div>
  );
}
