import { useState } from "react";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { useTranslation } from "../../i18n";
import { disconnectWorkbuddy, openWorkbuddyLogin } from "./api";
import { useWorkbuddyUsage } from "./useWorkbuddyUsage";

/**
 * Under the WorkBuddy session source while it is on: whether the island is signed in to the
 * WorkBuddy website (for the credits ring and alerts), with the one action that state calls for.
 * Sessions are read locally and need no sign-in.
 */
export function WorkbuddySignInRow({ polling }: { polling: boolean }) {
  const text = useTranslation().settings.agent.workbuddy;
  const { state, retry } = useWorkbuddyUsage(true, polling);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const run = (action: () => Promise<void>) => {
    setBusy(true);
    setFailed(false);
    void action().catch(() => setFailed(true)).finally(() => setBusy(false));
  };
  const signedIn = state.status === "ready" || state.status === "connected";
  const [label, action] = state.status === "unavailable"
    ? [text.retry, retry]
    : signedIn ? [text.signOut, disconnectWorkbuddy] : [text.signIn, openWorkbuddyLogin];
  return (
    <SettingsRow
      indent
      title={<span className="workbuddy-sign-in__status" role="status">{busy ? text.busy : failed ? text.actionFailed : text[state.status]}</span>}
      control={<SettingsLinkButton disabled={busy} onClick={() => run(action)}>{label}</SettingsLinkButton>}
    />
  );
}
