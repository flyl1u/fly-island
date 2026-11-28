import { useState, type ReactNode } from "react";
import { SettingsRow } from "./SettingsRow";
import { SettingsInput } from "./SettingsInput";
import { SettingsLinkButton } from "./SettingsLinkButton";

/**
 * A row that takes a secret (a token, a credential). The field only ever holds what the user
 * is typing right now: a saved value is never written back into it, and the draft is cleared
 * once it has been handed over.
 *
 * The save button stays clickable even when the field is empty: saving an empty secret is how
 * a stored credential gets removed (see docs/plugins/specification.md).
 */
export function SettingsSecretRow({
  title,
  description,
  saveLabel,
  placeholder,
  disabled = false,
  onSave,
}: {
  title: ReactNode;
  description?: ReactNode;
  saveLabel: string;
  placeholder?: string;
  disabled?: boolean;
  onSave: (value: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <SettingsRow
      title={title}
      description={description}
      control={
        <SettingsLinkButton
          disabled={disabled || saving}
          onClick={async () => {
            setSaving(true);
            try { if (await onSave(draft)) setDraft(""); }
            finally { setSaving(false); }
          }}
        >
          {saveLabel}
        </SettingsLinkButton>
      }
    >
      <SettingsInput
        aria-label={typeof title === "string" ? title : undefined}
        type="password"
        autoComplete="off"
        value={draft}
        disabled={disabled || saving}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
      />
    </SettingsRow>
  );
}
