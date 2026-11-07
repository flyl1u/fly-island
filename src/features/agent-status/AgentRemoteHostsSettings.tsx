import { useCallback, useEffect, useState } from "react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { useTranslation } from "../../i18n";
import { getErrorMessage } from "../../utils/error";
import { getAgentRemoteHosts, listSshHosts, setAgentRemoteHosts, type RemoteHostStatus } from "./api";

/** The status of a chosen host is re-read this often while the page is open. */
const STATUS_POLL_MS = 3_000;

/**
 * Settings → AI Agent: which Hosts from ~/.ssh/config the island reads agent sessions from over
 * SSH (src-tauri/src/agent_status/remote_sessions.rs), with how the last read of each went.
 */
export function AgentRemoteHostsSettings() {
  const text = useTranslation().settings.agent;
  const [available, setAvailable] = useState<string[] | null>(null);
  const [statuses, setStatuses] = useState<RemoteHostStatus[]>([]);
  const [error, setError] = useState("");

  const refreshStatuses = useCallback(() => {
    getAgentRemoteHosts()
      .then(setStatuses)
      .catch((reason: unknown) => console.error("Failed to read remote hosts", reason));
  }, []);

  useEffect(() => {
    listSshHosts()
      .then(setAvailable)
      .catch((reason: unknown) => setError(getErrorMessage(reason)));
    refreshStatuses();
    const timer = window.setInterval(refreshStatuses, STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [refreshStatuses]);

  const chosen = statuses.map((status) => status.host);
  const toggle = (host: string, on: boolean) => {
    const next = on ? [...chosen, host] : chosen.filter((known) => known !== host);
    setAgentRemoteHosts(next)
      .then(() => {
        setError("");
        refreshStatuses();
      })
      .catch((reason: unknown) => setError(getErrorMessage(reason)));
  };
  const describe = (status: RemoteHostStatus | undefined) => {
    if (!status) return undefined;
    if (status.error) return text.remoteFailed(status.error);
    if (status.fetchedAt !== null) return text.remoteFetchedAt(new Date(status.fetchedAt).toLocaleTimeString());
    return text.remoteFetching;
  };
  // Chosen hosts stay listed even when they left ~/.ssh/config, so they can be switched off.
  const hosts = [...(available ?? []), ...chosen.filter((host) => !available?.includes(host))];

  return (
    <SettingsGroup title={text.remoteSection} footer={error || text.remoteHint}>
      {available !== null && hosts.length === 0 ? <SettingsRow title={text.remoteNoHosts} /> : null}
      {hosts.map((host) => {
        const status = statuses.find((known) => known.host === host);
        return (
          <SettingsToggleRow
            key={host}
            title={host}
            description={describe(status)}
            checked={status !== undefined}
            onChange={(on) => toggle(host, on)}
          />
        );
      })}
    </SettingsGroup>
  );
}
