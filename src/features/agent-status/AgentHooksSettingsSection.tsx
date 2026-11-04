import { CircleAlert, Check, RefreshCcw, X } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { AgentHooksInstallResult, AgentHooksState, AgentStatusSnapshot } from "./api";
import { getAgentHooksNotice, getAgentPhaseLabel, getAgentStatusLabel, getAgentVisualState, isAgentAttentionPhase, listAgentStatuses, type AgentHooksInstallState } from "./status";
import "./AgentHooksSettingsSection.css";

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
  const agentStatusRows = listAgentStatuses(agentStatus).map(({ key, label, status }) => {
    return {
      provider: key,
      label,
      phase: status.phase,
      phaseLabel: getAgentPhaseLabel(status.phase, t),
      needsAttention: isAgentAttentionPhase(status.phase),
    };
  });
  const agentStatusLabel = getAgentStatusLabel(agentStatus, t);
  const hooksNotice = getAgentHooksNotice(agentHooksState);

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
            hooksNotice ? "agent-hooks-button--attention" : "",
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
      {hooksNotice ? (
        <p className="agent-hooks-notice" role="status">
          <CircleAlert size={14} strokeWidth={2.4} aria-hidden="true" />
          <span>{hooksNotice === "update" ? t.settings.agent.hooksOutdated : t.settings.agent.hooksMissing}</span>
        </p>
      ) : null}
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
      <div className="agent-status-legend" role="group" aria-label={t.settings.agent.legendTitle}>
        <span className="agent-status-legend__title">{t.settings.agent.legendTitle}</span>
        {(["idle", "running", "attention"] as const).map((state) => (
          <span className="agent-status-legend__item" key={state}>
            <span className={`agent-status-legend__dot agent-status-legend__dot--${state}`} aria-hidden="true" />
            {t.settings.agent.legend[state]}
          </span>
        ))}
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
