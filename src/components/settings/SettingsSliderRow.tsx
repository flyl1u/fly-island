import { useId, type CSSProperties, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { SettingsRow } from "./SettingsRow";
import "./SettingsSliderRow.css";

/**
 * A row for a number on a range: title with the value in a pill (and a way back to
 * the default once it differs), then a slider across the whole row.
 */
export function SettingsSliderRow({
  title,
  description,
  value,
  min,
  max,
  step,
  format,
  defaultValue,
  resetLabel,
  indent,
  onChange,
}: {
  title: ReactNode;
  description?: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  defaultValue?: number;
  /** Accessible name of the reset button; needed when `defaultValue` is given. */
  resetLabel?: string;
  indent?: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const canReset = defaultValue !== undefined && value !== defaultValue;

  return (
    <SettingsRow
      title={title}
      description={description}
      indent={indent}
      labelFor={id}
      control={
        <>
          {canReset ? (
            <button
              className="settings-slider__reset"
              type="button"
              aria-label={resetLabel}
              onClick={() => onChange(defaultValue)}
            >
              <RotateCcw size={13} strokeWidth={2.2} aria-hidden="true" />
            </button>
          ) : null}
          <output className="settings-slider__value" htmlFor={id}>{format(value)}</output>
        </>
      }
    >
      <input
        id={id}
        className="settings-slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--settings-slider-fill": `${fill}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </SettingsRow>
  );
}
