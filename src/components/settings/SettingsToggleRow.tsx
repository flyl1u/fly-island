import { useId, type ReactNode } from "react";
import { SettingsRow } from "./SettingsRow";
import { SettingsSwitch } from "./SettingsSwitch";

/** A row whose control is an on / off switch; clicking the title toggles it too. */
export function SettingsToggleRow({
  title,
  description,
  checked,
  disabled = false,
  indent,
  onChange,
}: {
  title: ReactNode;
  description?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  indent?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <SettingsRow
      title={title}
      description={description}
      indent={indent}
      labelFor={id}
      control={<SettingsSwitch id={id} checked={checked} disabled={disabled} onChange={onChange} />}
    />
  );
}
