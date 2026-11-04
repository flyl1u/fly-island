import { LOCALE_CODES, TRANSLATIONS, isLocaleCode, type LocaleCode } from "./index";
import "./LocaleControl.css";

export function LocaleControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: LocaleCode;
  onChange: (locale: LocaleCode) => void;
}) {
  return (
    <label className="locale-control">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => {
          const next = event.currentTarget.value;
          if (isLocaleCode(next)) {
            onChange(next);
          }
        }}
      >
        {LOCALE_CODES.map((code) => (
          <option key={code} value={code}>
            {TRANSLATIONS[code].localeLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
