import { useState } from "react";
import { resolveHexColor } from "./hexColor";
import "./HexColorInput.css";

export function HexColorInput({ value, ariaLabel, onChange }: {
  value: string;
  ariaLabel: string;
  onChange: (value: string) => void;
}) {
  const [editing, setEditing] = useState<{ draft: string; original: string } | null>(null);
  const save = () => {
    if (!editing) return;
    const next = resolveHexColor(editing.draft, editing.original);
    setEditing(null);
    if (next !== value) onChange(next);
  };

  return editing ? (
    <input
      className="appearance-hex appearance-hex--editing"
      type="text"
      aria-label={ariaLabel}
      value={editing.draft}
      autoFocus
      autoComplete="off"
      spellCheck={false}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setEditing({ ...editing, draft: event.currentTarget.value })}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          save();
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setEditing(null);
        }
      }}
    />
  ) : (
    <button
      className="appearance-hex"
      type="button"
      aria-label={ariaLabel}
      onClick={() => setEditing({ draft: value.toUpperCase(), original: value })}
    >
      {value.toUpperCase()}
    </button>
  );
}
