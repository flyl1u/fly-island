import "./SettingsSwitch.css";

/** On / off switch in the settings window's accent colour. Named by a label pointing at `id` or by `ariaLabel`. */
export function SettingsSwitch({
  id,
  ariaLabel,
  size = "default",
  checked,
  disabled = false,
  onChange,
}: {
  id?: string;
  ariaLabel?: string;
  size?: "default" | "small";
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <span className={size === "small" ? "settings-switch settings-switch--small" : "settings-switch"}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-label={ariaLabel}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span className="settings-switch__track" aria-hidden="true" />
    </span>
  );
}
