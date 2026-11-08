import { useId, useState } from "react";
import { CirclePlus, Server, Trash2 } from "lucide-react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSwitch } from "../../components/settings/SettingsSwitch";
import { useTranslation } from "../../i18n";
import { RemoteHostForm } from "./RemoteHostForm";
import { customAddress, useRemoteHosts, type RemoteHostEntry } from "./useRemoteHosts";
import "./AgentRemoteHostsSettings.css";

/**
 * Settings → AI Agent → Remote computers: which computers the island reads agent sessions from
 * over SSH (src-tauri/src/agent_status/remote_sessions.rs), how the last read of each went, and
 * computers added by address next to the Hosts of ~/.ssh/config.
 */
export function AgentRemoteHostsSettings() {
  const text = useTranslation().settings.agent;
  const remote = useRemoteHosts();
  const [adding, setAdding] = useState(false);

  return (
    <>
      <SettingsGroup>
        <div className="agent-remote__intro">
          <Server size={18} strokeWidth={2} aria-hidden="true" />
          <div>
            <p>{text.remoteIntro}</p>
            <p>{text.remoteRequirements}</p>
          </div>
        </div>
      </SettingsGroup>
      <SettingsGroup
        title={text.remoteHostsSection}
        action={remote.entries.some((entry) => entry.status) ? <SettingsLinkButton onClick={remote.refresh}>{text.remoteRefresh}</SettingsLinkButton> : undefined}
        footer={remote.error ? <span className="agent-remote__error">{remote.error}</span> : text.remoteHostsFooter}
      >
        {remote.loaded && remote.entries.length === 0 ? <SettingsRow searchable={false} title={text.remoteEmpty} description={text.remoteEmptyHint} /> : null}
        {remote.entries.map((entry) => (
          <HostRow key={entry.name} entry={entry} onToggle={(on) => remote.toggle(entry.name, on)} onRemove={() => remote.remove(entry.name)} />
        ))}
        {adding ? (
          <div className="agent-remote__adding">
            <RemoteHostForm onAdd={remote.add} onCancel={() => setAdding(false)} />
            <p className="agent-remote__hint">{text.remoteAddHint}</p>
          </div>
        ) : (
          <button className="agent-remote__add" type="button" onClick={() => setAdding(true)}>
            <CirclePlus size={16} strokeWidth={2} aria-hidden="true" />
            {text.remoteAdd}
          </button>
        )}
      </SettingsGroup>
    </>
  );
}

function HostRow({ entry, onToggle, onRemove }: { entry: RemoteHostEntry; onToggle: (on: boolean) => void; onRemove: () => void }) {
  const text = useTranslation().settings.agent;
  const id = useId();
  const { status } = entry;
  const origin = entry.custom ? customAddress(entry.custom) : text.remoteFromConfig;
  let state: string | null = null;
  if (status?.error) state = text.remoteFailed(status.error);
  else if (status?.fetchedAt != null) state = text.remoteFetchedAt(new Date(status.fetchedAt).toLocaleTimeString(), status.sessions ?? 0);
  else if (status) state = text.remoteFetching;
  return (
    <SettingsRow searchable={false}
      title={entry.name}
      labelFor={id}
      description={
        <>
          <span className="agent-remote__origin">{origin}</span>
          {state ? <span className={status?.error ? "agent-remote__state agent-remote__error" : "agent-remote__state"}>{state}</span> : null}
          {status?.approvalError && !status.error ? <span className="agent-remote__state agent-remote__error">{text.remoteApprovalFailed(status.approvalError)}</span> : null}
        </>
      }
      control={
        <>
          {entry.custom ? (
            <button className="agent-remote__remove" type="button" aria-label={text.remoteRemove(entry.name)} title={text.remoteRemove(entry.name)} onClick={onRemove}>
              <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
            </button>
          ) : null}
          <SettingsSwitch id={id} checked={status !== null} onChange={onToggle} />
        </>
      }
    />
  );
}
