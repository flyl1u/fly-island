import "./SettingsSwitch.css";

/** On / off switch in the settings window's accent colour. Named by a label pointing at `id`. */
export function SettingsSwitch({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <span className="settings-switch">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span className="settings-switch__track" aria-hidden="true" />
    </span>
  );
}
