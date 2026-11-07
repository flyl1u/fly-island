import { useState } from "react";
import { SettingsInput } from "../../components/settings/SettingsInput";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { useTranslation } from "../../i18n";
import type { CustomRemoteHost } from "./api";

/** Adds a computer by address on the Remote computers page; kept in the island's own settings. */
export function RemoteHostForm({ onAdd, onCancel }: {
  onAdd: (host: CustomRemoteHost) => Promise<boolean>;
  onCancel: () => void;
}) {
  const text = useTranslation().settings.agent;
  const [name, setName] = useState("");
  const [user, setUser] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [busy, setBusy] = useState(false);
  const portNumber = port.trim() === "" ? null : Number(port);
  const portValid = portNumber === null || (Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65535);

  const field = (label: string, value: string, set: (value: string) => void, props: { placeholder?: string; inputMode?: "numeric"; required?: boolean }) => (
    <label className="agent-remote__field">
      <span>{label}</span>
      <SettingsInput monospace value={value} disabled={busy} maxLength={253} autoComplete="off" onChange={(event) => set(event.currentTarget.value)} {...props} />
    </label>
  );

  return (
    <form
      className="agent-remote__form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!host.trim() || !portValid) return;
        setBusy(true);
        void onAdd({ name: name.trim(), user: user.trim() || null, host: host.trim(), port: portNumber }).then((added) => {
          setBusy(false);
          if (added) onCancel();
        });
      }}
    >
      <div className="agent-remote__fields">
        {field(text.remoteHost, host, setHost, { placeholder: text.remoteHostPlaceholder, required: true })}
        {field(text.remotePort, port, setPort, { placeholder: "22", inputMode: "numeric" })}
        {field(text.remoteUser, user, setUser, { placeholder: text.remoteUserPlaceholder })}
        {field(text.remoteName, name, setName, { placeholder: text.remoteNamePlaceholder })}
      </div>
      <div className="agent-remote__buttons">
        <SettingsLinkButton disabled={busy} onClick={onCancel}>{text.remoteCancel}</SettingsLinkButton>
        <button className="agent-remote__submit" type="submit" disabled={busy || !host.trim() || !portValid}>{text.remoteSave}</button>
      </div>
    </form>
  );
}
