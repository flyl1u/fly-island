import { useState } from "react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { useTranslation } from "../../i18n";
import { disconnectWorkbuddy, openWorkbuddyLogin } from "./api";
import { useWorkbuddyUsage } from "./useWorkbuddyUsage";

export function WorkbuddyConnectionSettings({ polling }: { polling: boolean }) {
  const text = useTranslation().settings.agent.workbuddy;
  const { state, retry } = useWorkbuddyUsage(true, polling);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const run = (action: () => Promise<void>) => {
    setBusy(true);
    setFailed(false);
    void action().catch(() => setFailed(true)).finally(() => setBusy(false));
  };
  const canSignIn = state.status === "signedOut" || state.status === "loginRequired";
  const primary = canSignIn ? openWorkbuddyLogin : retry;
  return (
    <SettingsGroup title="WorkBuddy">
      <SettingsRow title={<span className="workbuddy-connection__status" role="status">{busy ? text.busy : failed ? text.actionFailed : text[state.status]}</span>}
        control={<SettingsLinkButton disabled={busy} onClick={() => run(primary)}>{canSignIn ? text.signIn : state.status === "unavailable" ? text.retry : text.refresh}</SettingsLinkButton>}
      />
      {state.status !== "signedOut" && (
        <SettingsRow title={text.disconnect} control={<SettingsLinkButton disabled={busy} onClick={() => run(disconnectWorkbuddy)}>{text.disconnectAction}</SettingsLinkButton>} />
      )}
    </SettingsGroup>
  );
}
