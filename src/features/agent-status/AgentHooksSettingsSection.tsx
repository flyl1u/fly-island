import { Check, RefreshCcw, X } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { AgentHooksInstallResult, AgentProvider, AgentStatusSnapshot } from "./api";
import { AGENT_PROVIDERS, AGENT_PROVIDER_LABELS, getAgentPhaseLabel, getAgentStatusLabel, getAgentVisualState, isAgentAttentionPhase, type AgentHooksInstallState } from "./status";

export function AgentHooksSettingsSection({ agentStatus, clearingAgentProvider, agentHooksInstallState, agentHooksInstallResult, agentHooksInstallError, onClearAgentStatus, onInstallAgentHooks }: {
  agentStatus: AgentStatusSnapshot;
  clearingAgentProvider: AgentProvider | null;
  agentHooksInstallState: AgentHooksInstallState;
  agentHooksInstallResult: AgentHooksInstallResult | null;
  agentHooksInstallError: string;
  onClearAgentStatus: (provider: AgentProvider) => void;
  onInstallAgentHooks: () => void;
}) {
  const t = useTranslation();
  const agentStatusRows = AGENT_PROVIDERS.map((provider) => {
    const status = agentStatus[provider];
    return {
      provider,
      label: AGENT_PROVIDER_LABELS[provider],
      phase: status.phase,
      phaseLabel: getAgentPhaseLabel(status.phase, t),
      needsAttention: isAgentAttentionPhase(status.phase),
    };
  });
  const agentStatusLabel = getAgentStatusLabel(agentStatus, t);

  return (
    <section className="settings-section settings-section--agent-hooks">
      <div className="settings-section__header">
        <span>{t.settings.agent.title}</span>
        <button
          className={[
            "agent-hooks-button",
            agentHooksInstallState === "installed"
              ? "agent-hooks-button--installed"
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
          type="button"
          disabled={agentHooksInstallState === "installing"}
          onClick={onInstallAgentHooks}
        >
          {agentHooksInstallState === "installed" ? (
            <Check size={13} strokeWidth={2.6} />
          ) : (
            <RefreshCcw size={13} strokeWidth={2.4} />
          )}
          <span>
            {agentHooksInstallState === "installing"
              ? t.settings.agent.installing
              : agentHooksInstallState === "installed"
                ? t.settings.agent.installed
                : t.settings.agent.install}
          </span>
        </button>
      </div>
      <div
        className={[
          "agent-status-panel",
          `agent-status-panel--${getAgentVisualState(agentStatus)}`,
        ].join(" ")}
      >
        <div className="agent-status-panel__summary">
          <span>{t.settings.agent.currentStatus}</span>
          <strong>{agentStatusLabel}</strong>
        </div>
        <div className="agent-status-panel__rows">
          {agentStatusRows.map((row) => (
            <div
              className={[
                "agent-status-row",
                row.needsAttention ? "agent-status-row--attention" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={row.provider}
            >
              <span>{row.label}</span>
              <strong>{row.phaseLabel}</strong>
              {row.needsAttention ? (
                <button
                  className="agent-status-clear-button"
                  type="button"
                  disabled={clearingAgentProvider === row.provider}
                  title={t.settings.agent.clearStatusFor(row.label)}
                  aria-label={t.settings.agent.clearStatusFor(row.label)}
                  onClick={() => onClearAgentStatus(row.provider)}
                >
                  <X size={12} strokeWidth={2.4} />
                  <span>
                    {clearingAgentProvider === row.provider
                      ? t.settings.agent.clearing
                      : t.settings.agent.clearStatus}
                  </span>
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      {agentHooksInstallState === "installed" && agentHooksInstallResult ? (
        <div className="agent-hooks-status agent-hooks-status--ok">
          <span>{t.settings.agent.scriptsDir}</span>
          <strong title={agentHooksInstallResult.scriptsDir}>
            {agentHooksInstallResult.scriptsDir}
          </strong>
        </div>
      ) : null}
      {agentHooksInstallState === "error" ? (
        <div className="agent-hooks-status agent-hooks-status--error">
          {agentHooksInstallError}
        </div>
      ) : null}
    </section>
  );
}
