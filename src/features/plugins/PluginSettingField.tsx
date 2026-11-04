import { NumberControl } from "../../components/controls/NumberControl";
import { SelectControl } from "../../components/controls/SelectControl";
import { ToggleControl } from "../../components/controls/ToggleControl";
import { useLocale } from "../../i18n";
import type { PluginSettingSpec } from "./api";

/** One declared plugin setting, drawn with the island's own controls. */
export function PluginSettingField({
  spec,
  value,
  disabled,
  onChange,
}: {
  spec: PluginSettingSpec;
  value: unknown;
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const { locale } = useLocale();
  const title = spec.title[locale];
  const description = spec.description?.[locale];
  const text = typeof value === "string" ? value : "";

  const control = (() => {
    switch (spec.type) {
      case "boolean":
        return <ToggleControl label={title} checked={value === true} onChange={(next) => !disabled && onChange(next)} />;
      case "number":
        return (
          <NumberControl
            label={title}
            value={typeof value === "number" ? value : 0}
            min={spec.min ?? 0}
            max={spec.max ?? 1_000_000}
            onChange={(next) => !disabled && onChange(next)}
          />
        );
      case "select":
        return (
          <label className="plugin-setting__row">
            <span>{title}</span>
            <SelectControl
              value={typeof value === "string" ? value : ""}
              options={(spec.options ?? []).map((option) => ({ value: option.value, label: option.title[locale] }))}
              ariaLabel={title}
              disabled={disabled}
              onChange={onChange}
            />
          </label>
        );
      case "string":
        return (
          <label className="plugin-setting__row">
            <span>{title}</span>
            {/* Saved on blur or Enter, not on every key; a new saved value resets it. */}
            <input
              key={text}
              className="plugin-setting__input"
              defaultValue={text}
              disabled={disabled}
              onBlur={(event) => event.currentTarget.value !== text && onChange(event.currentTarget.value)}
              onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
            />
          </label>
        );
    }
  })();

  return (
    <div className="plugin-setting">
      {control}
      {description ? <p className="settings-section__hint">{description}</p> : null}
    </div>
  );
}
