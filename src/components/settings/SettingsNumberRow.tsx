import { useId, type ReactNode } from "react";
import { NumberStepper } from "../NumberStepper";
import "./SettingsInput.css";
import { SettingsRow } from "./SettingsRow";

/**
 * A row for a whole number typed in: a short field at the right end of the title line. The value
 * is kept within `min`..`max` once the field loses focus; an empty or partial entry is not saved.
 */
export function SettingsNumberRow({
  title,
  description,
  value,
  min,
  max,
  unit,
  step,
  indent,
  onChange,
}: {
  title: ReactNode;
  description?: ReactNode;
  value: number;
  min: number;
  max: number;
  /** Shown after the field, such as "秒". */
  unit?: string;
  step?: number;
  indent?: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();

  return (
    <SettingsRow
      title={<span id={`${id}-title`}>{title}</span>}
      description={description}
      indent={indent}
      labelFor={id}
      control={
        <span className="settings-number">
          <NumberStepper id={id} ariaLabelledBy={`${id}-title`} value={value}
            min={min} max={max} step={step} onChange={onChange} />
          {unit ? <span className="settings-number__unit">{unit}</span> : null}
        </span>
      }
    />
  );
}
