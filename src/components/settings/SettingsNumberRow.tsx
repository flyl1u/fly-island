import { useEffect, useId, useState, type ReactNode } from "react";
import { SettingsInput } from "./SettingsInput";
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
  indent?: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const number = Math.round(Number(draft));
    const next = Number.isFinite(number) && draft.trim() !== "" ? Math.min(max, Math.max(min, number)) : value;
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <SettingsRow
      title={title}
      description={description}
      indent={indent}
      labelFor={id}
      control={
        <>
          <SettingsInput
            id={id}
            className="settings-input--number"
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
            }}
          />
          {unit ? <span className="settings-number__unit">{unit}</span> : null}
        </>
      }
    />
  );
}
