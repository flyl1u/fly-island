import { SelectControl } from "../components/controls/SelectControl";
import { LOCALE_CODES, TRANSLATIONS, isLocaleCode, type LocaleCode } from "./index";
import "./LocaleControl.css";

const LOCALE_OPTIONS = LOCALE_CODES.map((code) => ({ value: code, label: TRANSLATIONS[code].localeLabel }));

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
    <div className="locale-control">
      <span>{label}</span>
      <SelectControl
        value={value}
        options={LOCALE_OPTIONS}
        ariaLabel={label}
        onChange={(next) => {
          if (isLocaleCode(next)) {
            onChange(next);
          }
        }}
      />
    </div>
  );
}
