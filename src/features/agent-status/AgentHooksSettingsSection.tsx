import { CircleAlert } from "lucide-react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { useTranslation } from "../../i18n";
import type { AgentHooksInstallResult, AgentHooksState, AgentStatusSnapshot } from "./api";
import { RemoteResultLines } from "./RemoteResultLines";
import { getAgentHooksNotice, getAgentPhaseLabel, getAgentStatusLabel, isAgentAttentionPhase, listAgentStatuses, type AgentHooksInstallState } from "./status";
import "./AgentHooksSettingsSection.css";

/**
 * Settings → AI Agent → the hooks: Install / repair on the title line, the overall state and one
 * row per agent (with a way to clear one stuck on an error), and under the card what the last
 * install said, or that the installed hooks are missing or old.
 */
export function AgentHooksSettingsSection({ agentStatus, clearingAgentProvider, agentHooksInstallState, agentHooksInstallResult, agentHooksInstallError, agentHooksState, onClearAgentStatus, onInstallAgentHooks }: {
  agentStatus: AgentStatusSnapshot;
  /** The provider or reported source id being cleared. */
  clearingAgentProvider: string | null;
  agentHooksInstallState: AgentHooksInstallState;
  agentHooksInstallResult: AgentHooksInstallResult | null;
  agentHooksInstallError: string;
  /** Null until read; outdated hooks get a notice asking for Install/Repair. */
  agentHooksState: AgentHooksState | null;
  onClearAgentStatus: (provider: string) => void;
  onInstallAgentHooks: () => void;
}) {
  const t = useTranslation();
  const text = t.settings.agent;
  const hooksNotice = getAgentHooksNotice(agentHooksState);
  const installLabel = agentHooksInstallState === "installing" ? text.installing : agentHooksInstallState === "installed" ? text.installed : text.install;

  const footer =
    agentHooksInstallState === "error" ? (
      <span className="agent-hooks-message agent-hooks-message--error" role="alert">{agentHooksInstallError}</span>
    ) : hooksNotice ? (
      <span className="agent-hooks-message agent-hooks-message--attention" role="status">
        <CircleAlert size={13} strokeWidth={2.4} aria-hidden="true" />
        {hooksNotice === "update" ? text.hooksOutdated : text.hooksMissing}
      </span>
    ) : agentHooksInstallState === "installed" && agentHooksInstallResult ? (
      <span className="agent-hooks-message">
        {text.scriptsDir} <code>{agentHooksInstallResult.scriptsDir}</code>
        <RemoteResultLines results={agentHooksInstallResult.remotes} />
      </span>
    ) : undefined;

  return (
    <SettingsGroup
      title={text.title}
      action={
        <SettingsLinkButton disabled={agentHooksInstallState === "installing"} onClick={onInstallAgentHooks}>
          {installLabel}
        </SettingsLinkButton>
      }
      footer={footer}
    >
      <SettingsRow title={text.currentStatus} control={<span className="agent-hooks-value">{getAgentStatusLabel(agentStatus, t)}</span>} />
      {listAgentStatuses(agentStatus).map(({ key, label, status }) => {
        const attention = isAgentAttentionPhase(status.phase);
        return (
          <SettingsRow
            key={key}
            title={label}
            control={
              <>
                <span className={attention ? "agent-hooks-value agent-hooks-value--attention" : "agent-hooks-value"}>
                  {getAgentPhaseLabel(status.phase, t)}
                </span>
                {attention && (
                  <SettingsLinkButton disabled={clearingAgentProvider === key} onClick={() => onClearAgentStatus(key)}>
                    {clearingAgentProvider === key ? text.clearing : text.clearStatus}
                  </SettingsLinkButton>
                )}
              </>
            }
          />
        );
      })}
    </SettingsGroup>
  );
}
