import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
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
      labelFor={id}
      control={
        <>
          {canReset ? (
            <button
              className="settings-slider__reset"
              type="button"
              aria-label={resetLabel}
              onClick={() => {
                setDraft(null);
                onPreviewChange?.(null);
                onChange(defaultValue);
              }}
            >
              <RotateCcw size={13} strokeWidth={2.2} aria-hidden="true" />
            </button>
          ) : null}
          <output className="settings-slider__value" htmlFor={id}>{format(shown)}</output>
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
