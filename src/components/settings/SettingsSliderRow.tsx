import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { NumberStepper } from "../NumberStepper";
import { SettingsRow } from "./SettingsRow";
import "./SettingsSliderRow.css";

/**
 * A row for a number on a range: a value (editable when asked, resettable when changed), and a
 * slider across the whole row.
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
  editable = false,
  unit,
  disabled = false,
  commitOnRelease = false,
  onPreviewChange,
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
  /** Replaces the value pill with a typed number and +/- buttons while retaining the slider. */
  editable?: boolean;
  unit?: string;
  disabled?: boolean;
  /**
   * Report the value once the thumb is let go (pointer up, key up, focus leaving) instead of on
   * every step; the pill and the track follow the drag meanwhile. For a value that resizes the
   * island, where each step would be a resize.
   */
  commitOnRelease?: boolean;
  /** Unsaved value for a live preview; null when the edit is committed or reset. */
  onPreviewChange?: (value: number | null) => void;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  const fill = max > min ? ((shown - min) / (max - min)) * 100 : 0;
  const canReset = defaultValue !== undefined && shown !== defaultValue;
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    onPreviewChange?.(null);
    if (draft !== value) onChange(draft);
  };
  // The thumb can be let go anywhere on screen, not only over the slider.
  useEffect(() => {
    if (draft === null) return;
    window.addEventListener("pointerup", commit);
    window.addEventListener("pointercancel", commit);
    return () => {
      window.removeEventListener("pointerup", commit);
      window.removeEventListener("pointercancel", commit);
    };
  });

  return (
    <SettingsRow
      title={title}
      description={description}
      indent={indent}
      disabled={disabled}
      labelFor={id}
      control={
        <>
          {canReset ? (
            <button
              className="settings-slider__reset"
              type="button"
              aria-label={resetLabel}
              disabled={disabled}
              onClick={() => {
                setDraft(null);
                onPreviewChange?.(null);
                onChange(defaultValue);
              }}
            >
              <RotateCcw size={13} strokeWidth={2.2} aria-hidden="true" />
            </button>
          ) : null}
          {editable ? (
            <span className="settings-slider__number">
              <NumberStepper
                ariaLabel={typeof title === "string" ? title : undefined}
                value={shown}
                min={min}
                max={max}
                step={step}
                disabled={disabled}
                formatValue={step < 1 ? (number) => number.toFixed(String(step).split(".")[1]?.length ?? 0) : undefined}
                onChange={(next) => onChange(next)}
              />
              {unit ? <span className="settings-slider__unit">{unit}</span> : null}
            </span>
          ) : <output className="settings-slider__value" htmlFor={id}>{format(shown)}</output>}
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
        value={shown}
        disabled={disabled}
        style={{ "--settings-slider-fill": `${fill}%` } as CSSProperties}
        onChange={(event) => {
          const next = Number(event.currentTarget.value);
          if (commitOnRelease) {
            setDraft(next);
            onPreviewChange?.(next);
          }
          else onChange(next);
        }}
        onKeyUp={commitOnRelease ? commit : undefined}
        onBlur={commitOnRelease ? commit : undefined}
      />
    </SettingsRow>
  );
}
