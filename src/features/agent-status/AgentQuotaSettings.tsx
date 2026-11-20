import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { useTranslation } from "../../i18n";
import { AGENT_QUOTA_SOURCES } from "../appearance/settings";
import type { AgentQuotaSource } from "../appearance/types";
import "./AgentQuotaSettings.css";

export function AgentQuotaSettings({ sources, offered, onChange }: {
  sources: readonly AgentQuotaSource[];
  /** Whether a source has a box here: the plugin-market agents only once installed and switched on. */
  offered: (source: AgentQuotaSource) => boolean;
  onChange: (sources: AgentQuotaSource[]) => void;
}) {
  const text = useTranslation().settings.agent.quotaRings;
  return (
    <SettingsGroup title={text.title}>
      <SettingsRow title={text.hint}>
        <div className="agent-quota-settings" role="group" aria-label={text.title}>
          {AGENT_QUOTA_SOURCES.filter(offered).map((source) => (
            <label className="agent-quota-settings__source" key={source}>
              <input type="checkbox" checked={sources.includes(source)} onChange={({ currentTarget }) => {
                const checked = currentTarget.checked;
                onChange(AGENT_QUOTA_SOURCES.filter((item) => item === source ? checked : sources.includes(item)));
              }} />
              {text.sources[source]}
            </label>
          ))}
        </div>
      </SettingsRow>
    </SettingsGroup>
  );
}
