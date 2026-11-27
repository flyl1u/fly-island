import { useEffect, useRef, useState } from "react";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsInput } from "../../components/settings/SettingsInput";

/** Integer settings save after typing pauses; blur/navigation flush the last valid edit. */
export function PluginNumberSettingRow({ title, value, min, max, disabled, onSave, description }: {
  description?: string;
  title: string;
  value: string;
  min: number;
  max: number;
  disabled: boolean;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<(() => void) | null>(null);
  const flush = () => {
    clearTimeout(timer.current);
    const save = pending.current;
    pending.current = null;
    save?.();
  };
  useEffect(() => flush, []);
  const valid = (text: string) => /^\d+$/.test(text) && Number.isSafeInteger(Number(text))
    && Number(text) >= min && Number(text) <= max;
  const change = (text: string) => {
    if (!/^\d*$/.test(text)) return;
    setDraft(text);
    clearTimeout(timer.current);
    pending.current = valid(text) ? () => onSave(String(Number(text))) : null;
    if (pending.current) timer.current = setTimeout(flush, 500);
  };
  return <SettingsRow title={title} description={description}>
    <SettingsInput aria-label={title} inputMode="numeric" pattern="[0-9]*"
      value={draft ?? value} disabled={disabled} aria-invalid={draft !== null && !valid(draft)}
      onChange={(event) => change(event.target.value)}
      onBlur={() => { flush(); setDraft(null); }}
      onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); flush(); }
        else if (event.key === "Escape") {
          event.preventDefault(); clearTimeout(timer.current); pending.current = null; setDraft(null);
        }
      }} />
  </SettingsRow>;
}
